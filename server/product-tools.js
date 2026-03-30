// product-tools.js — 박도현(Product Planning MD)용 Claude tool_use 도구 정의
// KG API (지식그래프) 기반 — Snowflake 직접 접속 불필요

const PRODUCT_PLANNING_TOOLS = [
  {
    name: 'query_product_info',
    description: `지식그래프 API로 상품 마스터 정보를 조회합니다.
품번, 브랜드, 카테고리, 시즌, 성별 등으로 필터링하여 상품 속성을 검색합니다.
반환: 제품코드, 제품명, 브랜드, 시즌, 아이템, 카테고리, 소비자가, 성별, 소재, 최초판매일 등 29개 컬럼`,
    input_schema: {
      type: 'object',
      properties: {
        filters: {
          type: 'array',
          description: '필터 조건. 예: [{ "system_code": "ST", "system_field_name": "BRD_CD" }, { "system_code": "26S", "system_field_name": "SESN" }]',
          items: {
            type: 'object',
            properties: {
              system_code: { type: 'string' },
              system_field_name: { type: 'string', enum: ['BRD_CD','PRDT_CD','SESN','ITEM_GROUP','ITEM','ITEM_NM','SEX_NM','ADULT_KIDS_NM','PARENT_PRDT_KIND_NM_WAS','PRDT_NM','CAT_NM','SUB_CAT_NM','DOMAIN_NM'] }
            },
            required: ['system_code', 'system_field_name']
          }
        },
        purpose: { type: 'string', description: '조회 목적 (기획 컨텍스트)' }
      },
      required: ['filters', 'purpose']
    }
  },
  {
    name: 'query_product_cost',
    description: `지식그래프 API로 스타일별 PO 원가를 조회합니다.
생산원가, 마크업, 공급가, 협력사, 환율 등을 포함합니다.
주의: MFAC_COST_AMT는 VAT 제외이므로 실제 원가/마크업 계산 시 ×1.1 필요`,
    input_schema: {
      type: 'object',
      properties: {
        filters_product: {
          type: 'array',
          description: '상품 필터. 예: [{ "system_code": "ST", "system_field_name": "BRD_CD" }]',
          items: {
            type: 'object',
            properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } },
            required: ['system_code', 'system_field_name']
          }
        },
        filters_order: {
          type: 'array',
          description: '오더 필터. 예: [{ "system_code": "한국", "system_field_name": "PO_CNTRY_NM" }]',
          items: {
            type: 'object',
            properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } },
            required: ['system_code', 'system_field_name']
          }
        },
        purpose: { type: 'string', description: '조회 목적' }
      },
      required: ['filters_product', 'purpose']
    }
  },
  {
    name: 'get_category_performance',
    description: `시즌 의류 카테고리/아이템별 발주·입고·판매·재고·판매율을 조회합니다.
당해 시즌과 전년 시즌을 비교하여 카테고리 성과를 분석합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        current_sesn: { type: 'string', description: '당해 시즌 (예: "26S")' },
        current_term_start: { type: 'string', description: '기간판매 시작일 (YYYY-MM-DD)' },
        current_term_end: { type: 'string', description: '기간판매 종료일 (YYYY-MM-DD)' },
        current_acum_end: { type: 'string', description: '누적판매 종료일 (YYYY-MM-DD)' },
        previous_sesn: { type: 'string', description: '전년 시즌 (예: "25S")' },
        previous_term_start: { type: 'string', description: '전년 기간판매 시작일' },
        previous_term_end: { type: 'string', description: '전년 기간판매 종료일' },
        previous_acum_end: { type: 'string', description: '전년 누적판매 종료일' },
        previous_season_end: { type: 'string', description: '전년 시즌마감일' },
        category: { type: 'string', description: '특정 카테고리 필터 (생략 시 전체)' }
      },
      required: ['current_sesn', 'current_term_start', 'current_term_end', 'current_acum_end', 'previous_sesn', 'previous_term_start', 'previous_term_end', 'previous_acum_end', 'previous_season_end']
    }
  },
  {
    name: 'get_top_selling_styles',
    description: `기간 내 판매 TOP 스타일 랭킹을 조회합니다.
판매액/판매수량/재고 기준으로 상위 스타일을 분석합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        start_dt: { type: 'string', description: '기간 시작일 (YYYY-MM-DD)' },
        end_dt: { type: 'string', description: '기간 종료일 (YYYY-MM-DD)' },
        limit: { type: 'number', description: '조회 상위 N개 (기본 20)' },
        category: { type: 'string', description: '카테고리 필터 (생략 시 전체)' },
        gender: { type: 'string', description: '성별 필터 (예: "남성", "여성", 생략 시 전체)' }
      },
      required: ['start_dt', 'end_dt']
    }
  },
  {
    name: 'get_similar_styles',
    description: `특정 품번의 전년도 유사상품을 조회합니다.
ML 기반 유사도 분석 결과를 반환합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        prdt_cd: { type: 'string', description: '품번 (제품코드). 예: "ST25FDWDJ93056"' }
      },
      required: ['prdt_cd']
    }
  },
  {
    name: 'get_product_stock_info',
    description: `상품 재고 현황을 조회합니다.
물류재고, 매장재고, 전체재고를 카테고리/아이템별로 분석합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        filters: {
          type: 'array',
          description: '필터 조건. 예: [{ "system_code": "ST", "system_field_name": "BRD_CD" }]',
          items: {
            type: 'object',
            properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } },
            required: ['system_code', 'system_field_name']
          }
        },
        end_dt: { type: 'string', description: '기준일자 (YYYY-MM-DD, 생략 시 오늘)' }
      },
      required: ['filters']
    }
  }
];

module.exports = { PRODUCT_PLANNING_TOOLS };
