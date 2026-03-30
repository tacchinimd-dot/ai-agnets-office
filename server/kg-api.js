// kg-api.js — 지식그래프(KG) API 클라이언트
// dcs-ai-cli를 통해 KG API를 호출합니다 (CLI가 인증을 처리)

const { execFile } = require('child_process');
const path = require('path');
const os = require('os');

// ── 설정 ──────────────────────────────────────────────────────────────────────

const CLI_PATH = process.env.DCS_AI_CLI_PATH || path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'dcs-ai-cli', 'dcs-ai-cli.exe');
const KG_TIMEOUT = parseInt(process.env.KG_API_TIMEOUT || '30000');

// ── CLI 브릿지 ────────────────────────────────────────────────────────────────

function callKgApi(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const args = [
      'fetch',
      '--endpoint', endpoint,
      '--method', method,
      '--stdout',
    ];

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      args.push('--body', JSON.stringify(body));
    }

    execFile(CLI_PATH, args, { timeout: KG_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`KG API CLI 오류: ${err.message}${stderr ? ' — ' + stderr.slice(0, 200) : ''}`));
      }

      // CLI stdout에서 JSON 파싱 (첫 줄이 로그일 수 있으므로 JSON 시작점 찾기)
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return reject(new Error(`KG API 응답 파싱 오류: JSON을 찾을 수 없습니다. stdout: ${stdout.slice(0, 200)}`));
      }

      try {
        const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
        resolve(parsed);
      } catch (e) {
        reject(new Error(`KG API 응답 파싱 오류: ${e.message}. stdout: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// ── 결과 정규화 ───────────────────────────────────────────────────────────────
// KG API 응답을 기존 Snowflake executeQuery 결과와 동일한 { columns, data, rowCount } 형식으로 변환

function normalizeResult(apiResponse) {
  // KG API 응답 구조: { status, data: { columns: [...], records: [...] }, meta: {...} }
  // 또는 직접 배열로 반환되는 경우도 있음
  if (!apiResponse) return { columns: [], data: [], rowCount: 0 };

  // data 필드 안에 records가 있는 경우
  if (apiResponse.data && Array.isArray(apiResponse.data.records)) {
    const records = apiResponse.data.records;
    const columns = apiResponse.data.columns || (records.length > 0 ? Object.keys(records[0]) : []);
    return { columns, data: records, rowCount: records.length };
  }

  // data 필드가 직접 배열인 경우
  if (apiResponse.data && Array.isArray(apiResponse.data)) {
    const records = apiResponse.data;
    const columns = records.length > 0 ? Object.keys(records[0]) : [];
    return { columns, data: records, rowCount: records.length };
  }

  // 최상위가 배열인 경우
  if (Array.isArray(apiResponse)) {
    const columns = apiResponse.length > 0 ? Object.keys(apiResponse[0]) : [];
    return { columns, data: apiResponse, rowCount: apiResponse.length };
  }

  // 기타: 그대로 반환
  return apiResponse;
}

// ── 고수준 API 함수 ──────────────────────────────────────────────────────────

/**
 * 채널별 판매 종합분석 (일/주/월/년 + 전년비)
 * @param {object} params - { selectors, filters, periods, same_shop, meta_info }
 */
async function getChannelSales(params) {
  const body = {
    selectors: params.selectors || [],
    filters: params.filters || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    periods: params.periods || { end_dt: new Date().toISOString().split('T')[0] },
    same_shop: params.same_shop !== undefined ? params.same_shop : true,
    meta_info: params.meta_info || {
      requested_record_rows: 20000,
      data_size_only: false,
      sql_only: false,
      with_sql: false,
      data_type: 'list',
    },
  };

  console.log('[KG-API] getChannelSales 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi(
    '/api/v1/hq/sales_analysis/channel/day_week_month_year/channel_day_month_week_year',
    'POST',
    body
  );
  return normalizeResult(raw);
}

/**
 * 날짜 데이터셋 (전년 동일/동요일 기준 날짜)
 */
async function getDateDataset() {
  console.log('[KG-API] getDateDataset 호출');
  const raw = await callKgApi('/api/v1/common/date_util/date_dataset', 'GET');
  return raw;
}

/**
 * 연결 상태 확인 (get_date_dataset GET 호출로 테스트)
 */
async function testConnection() {
  try {
    const result = await getDateDataset();
    console.log('[KG-API] 연결 테스트 성공');
    return true;
  } catch (e) {
    console.error('[KG-API] 연결 테스트 실패:', e.message);
    return false;
  }
}

/**
 * 상품 마스터 조회 (품번/브랜드/카테고리 등으로 검색)
 * @param {object} params - { filters, meta_info }
 */
async function getProductProperties(params) {
  const body = {
    filters: params.filters || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getProductProperties 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi('/api/v1/hq/search/product_codes_properties', 'POST', body);
  return normalizeResult(raw);
}

/**
 * 스타일 원가 조회 (PO별 생산원가)
 * @param {object} params - { selectors_product, selectors_cost, selectors_cost_account, selectors_order, filters_product, filters_order, meta_info }
 */
async function getProductCost(params) {
  const body = {
    selectors_product: params.selectors_product || [{ system_field_name: 'BRD_CD' }, { system_field_name: 'SESN' }, { system_field_name: 'PRDT_CD' }, { system_field_name: 'PRDT_NM' }],
    selectors_cost: params.selectors_cost || [{ system_field_name: 'MFAC_COST_MFAC_COST_AMT' }, { system_field_name: 'MFAC_COST_MARKUP' }, { system_field_name: 'MFAC_COST_TAG_AMT' }],
    selectors_cost_account: params.selectors_cost_account || [],
    selectors_order: params.selectors_order || [{ system_field_name: 'PO_NO' }, { system_field_name: 'MFAC_COMPY_NM' }],
    filters_product: params.filters_product || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    filters_order: params.filters_order || [],
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getProductCost 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi('/api/v1/hq/scm/product_po_manufacturing_cost', 'POST', body);
  return normalizeResult(raw);
}

/**
 * 시즌 의류 발입출판재 (카테고리/아이템별 발주·입고·판매·재고·판매율)
 */
async function getSeasonWearPerformance(params) {
  const body = {
    selectors: params.selectors || [{ system_field_name: 'BRD_CD' }, { system_field_name: 'ITEM_GROUP' }],
    filters: params.filters || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    current_season_period_filters: params.current_season_period_filters,
    previous_season_period_filters: params.previous_season_period_filters,
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getSeasonWearPerformance 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi('/api/v1/hq/sales_analysis/product/season_wear_order_stor_sale_stock', 'POST', body);
  return normalizeResult(raw);
}

/**
 * 시즌 스타일 랭킹 (스타일/컬러/사이즈별 판매 랭킹)
 */
async function getStyleRanking(params) {
  const body = {
    selectors_product: params.selectors_product || [{ system_field_name: 'BRD_CD' }, { system_field_name: 'SESN' }, { system_field_name: 'PRDT_CD' }, { system_field_name: 'PRDT_NM' }, { system_field_name: 'ITEM_GROUP' }],
    selectors_sku: params.selectors_sku || [],
    metrics: params.metrics || [{ system_field_name: 'SALE_AMT' }, { system_field_name: 'SALE_QTY' }, { system_field_name: 'STOCK_QTY' }],
    filters_product: params.filters_product || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    order_by_clauses: params.order_by_clauses || [{ system_field_name: 'SALE_AMT', direction: 'DESC' }],
    periods: params.periods,
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getStyleRanking 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi('/api/v1/hq/sales_analysis/product/season_wear_style_order_stor_sale_stock_sale_rt', 'POST', body);
  return normalizeResult(raw);
}

/**
 * 유사상품 조회
 */
async function getSimilarProducts(params) {
  const body = {
    filters: params.filters || [],
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getSimilarProducts 호출:', JSON.stringify(body).slice(0, 200));
  const raw = await callKgApi('/api/v1/hq/search/similar_products', 'POST', body);
  return normalizeResult(raw);
}

/**
 * 상품 재고 조회
 */
async function getProductStock(params) {
  const body = {
    selectors_product: params.selectors_product || [{ system_field_name: 'BRD_CD' }, { system_field_name: 'ITEM_GROUP' }],
    selectors_sku: params.selectors_sku || [],
    metrics: params.metrics || [{ system_field_name: 'STOCK_QTY' }, { system_field_name: 'STOCK_TAG_AMT' }],
    filters_product: params.filters_product || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    order_by_clauses: params.order_by_clauses || [{ system_field_name: 'STOCK_QTY', direction: 'DESC' }],
    end_dt: params.end_dt || new Date().toISOString().split('T')[0],
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getProductStock 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi('/api/v1/hq/stock/product_stock', 'POST', body);
  return normalizeResult(raw);
}

/**
 * 네이버 검색 키워드 분석
 */
async function getNaverSearchKeyword(params) {
  const body = {
    selectors: params.selectors || [{ system_field_name: 'BRD_CD' }, { system_field_name: 'END_DT' }],
    filters_product: params.filters_product || [{ system_code: 'ST', system_field_name: 'BRD_CD' }],
    filters_search_keyword: params.filters_search_keyword || [],
    periods: params.periods,
    meta_info: params.meta_info || { requested_record_rows: 20000, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
  };
  console.log('[KG-API] getNaverSearchKeyword 호출:', JSON.stringify(body).slice(0, 300));
  const raw = await callKgApi('/api/v1/hq/social_listening/naver_search_keyword', 'POST', body);
  return normalizeResult(raw);
}

module.exports = {
  callKgApi,
  normalizeResult,
  getChannelSales,
  getDateDataset,
  testConnection,
  getProductProperties,
  getProductCost,
  getSeasonWearPerformance,
  getStyleRanking,
  getSimilarProducts,
  getProductStock,
  getNaverSearchKeyword,
};
