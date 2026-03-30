// tools.js — 최재원(Data Analyst)용 Claude tool_use 도구 정의
// KG API (지식그래프) 기반 — Snowflake 직접 접속 불필요

const DATA_ANALYST_TOOLS = [
  {
    name: 'query_channel_sales',
    description: `지식그래프 API를 통해 채널별 판매 데이터를 조회합니다.
일/주/월/년 단위의 판매 종합분석과 전년비 비교가 가능합니다.

사용 가능한 selectors (조회 차원):
- BRD_CD: 브랜드코드
- SHOP_ID: 매장코드
- SHOP_NM: 매장명
- ANAL_CNTRY_NM: 판매채널-국가
- ANLYS_ON_OFF_CLS_NM: 온라인/오프라인
- ANLYS_AREA_NM: 판매채널-지역
- CHANNEL_TYPE: 판매채널-채널
- DX_KIDS_YN: 디스커버리 성인/키즈
- SAME_SHOP: 동일매장 여부

사용 가능한 filters (필터):
- 위 selectors와 동일한 필드에 system_code 값을 지정
- 예: { system_code: "ST", system_field_name: "BRD_CD" } → Sergio Tacchini만

periods (기간):
- end_dt: 기준일자 (YYYY-MM-DD), 이 날짜 기준으로 일/주/월/년 실적 + 전년비 자동 계산

반환 데이터: 일매출, 주매출, 월매출, 년매출, 전년 동기 대비, 매장수, 누적판매액, 목표 진척율 등`,
    input_schema: {
      type: 'object',
      properties: {
        selectors: {
          type: 'array',
          description: '조회 차원 목록. 예: [{ "system_field_name": "CHANNEL_TYPE" }]',
          items: {
            type: 'object',
            properties: {
              system_field_name: {
                type: 'string',
                enum: ['BRD_CD', 'SHOP_ID', 'SHOP_NM', 'ANAL_CNTRY_NM', 'ANLYS_ON_OFF_CLS_NM', 'ANLYS_AREA_NM', 'CHANNEL_TYPE', 'DX_KIDS_YN', 'SAME_SHOP'],
              }
            },
            required: ['system_field_name']
          }
        },
        filters: {
          type: 'array',
          description: '필터 조건 목록. 예: [{ "system_code": "ST", "system_field_name": "BRD_CD" }]',
          items: {
            type: 'object',
            properties: {
              system_code: { type: 'string', description: '필터 값' },
              system_field_name: { type: 'string', description: '필터 대상 필드' }
            },
            required: ['system_code', 'system_field_name']
          }
        },
        end_dt: {
          type: 'string',
          description: '기준 날짜 (YYYY-MM-DD). 이 날짜 기준으로 일/주/월/년 실적과 전년비를 계산합니다.'
        },
        same_shop: {
          type: 'boolean',
          description: '동일매장 비교 여부 (기본값: true). 기존점/신규점/폐점 구분 표시'
        },
        purpose: {
          type: 'string',
          description: '이 조회를 수행하는 이유 (분석 컨텍스트)'
        }
      },
      required: ['filters', 'end_dt', 'purpose']
    }
  },
  {
    name: 'get_weekly_summary',
    description: `최근 N주간 채널별 판매 요약을 지식그래프 API로 조회합니다.
채널별(온라인/오프라인/지역별) 실적을 한번에 비교할 수 있습니다.`,
    input_schema: {
      type: 'object',
      properties: {
        weeks: {
          type: 'number',
          description: '조회할 최근 주 수 (기본 4, 최대 12)'
        },
        channel_type: {
          type: 'string',
          description: '특정 채널 타입 필터 (생략 시 전체). 예: "직영점", "백화점", "온라인"'
        }
      },
      required: ['weeks']
    }
  },
  {
    name: 'get_date_dataset',
    description: `오늘 기준 날짜 데이터셋을 조회합니다.
일/주/월/년 단위의 시작일·종료일과 전년 동일/동요일 기준 날짜를 제공합니다.
전년비 분석 전에 반드시 이 도구로 날짜를 확인하세요.`,
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

module.exports = { DATA_ANALYST_TOOLS };
