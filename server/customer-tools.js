// customer-tools.js — 윤지수(Customer Analyst)용 Claude tool_use 도구 정의
// KG API 기반 고객 분석

const CUSTOMER_ANALYST_TOOLS = [
  {
    name: 'query_customer_sales',
    description: `지식그래프 API로 고객 세그먼트별 판매 데이터를 조회합니다.
고객 성별/연령대 × 상품 카테고리 × 채널별 판매 분석이 가능합니다.
시계열 분석(일/주/월 단위)도 지원합니다.

고객 셀렉터: CUST_SEX(성별), CUST_AGE_GRP_AGE_GRP(연령대), CUST_JOIN_BRD_CD(가입브랜드), CUST_PURCH_CNT(구매횟수)
상품 셀렉터: ITEM_GROUP(카테고리), BRD_CD, SESN, SEX_NM 등
채널 셀렉터: CHANNEL_TYPE, ANLYS_ON_OFF_CLS_NM(온/오프라인), SHOP_NM
메트릭: SALE_AMT(판매액), SALE_QTY(판매수량), SALE_TAG_AMT(택가), SALE_DISCOUNT_AMT(할인금액)`,
    input_schema: {
      type: 'object',
      properties: {
        selectors_customer: {
          type: 'array',
          description: '고객 차원. 예: [{"system_field_name":"CUST_SEX"}, {"system_field_name":"CUST_AGE_GRP_AGE_GRP"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string', enum: ['CUST_SEX','CUST_AGE_GRP_AGE_GRP','CUST_JOIN_BRD_CD','CUST_PURCH_CNT'] } }, required: ['system_field_name'] }
        },
        selectors_product: {
          type: 'array',
          description: '상품 차원. 예: [{"system_field_name":"ITEM_GROUP"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        selectors_channel: {
          type: 'array',
          description: '채널 차원. 예: [{"system_field_name":"CHANNEL_TYPE"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        filters_product: {
          type: 'array',
          description: '상품 필터. 예: [{"system_code":"ST","system_field_name":"BRD_CD"}]',
          items: { type: 'object', properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } }, required: ['system_code','system_field_name'] }
        },
        filters_customer: {
          type: 'array',
          description: '고객 필터. 예: [{"system_code":"여성","system_field_name":"CUST_SEX"}]',
          items: { type: 'object', properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } }, required: ['system_code','system_field_name'] }
        },
        start_dt: { type: 'string', description: '기간 시작일 (YYYY-MM-DD)' },
        end_dt: { type: 'string', description: '기간 종료일 (YYYY-MM-DD)' },
        is_time_series: { type: 'boolean', description: '시계열 분석 여부 (기본 false)' },
        time_series_unit: { type: 'string', enum: ['day','week','month'], description: '시계열 단위 (is_time_series=true일 때)' },
        purpose: { type: 'string', description: '조회 목적' }
      },
      required: ['filters_product', 'start_dt', 'end_dt', 'purpose']
    }
  }
];

module.exports = { CUSTOMER_ANALYST_TOOLS };
