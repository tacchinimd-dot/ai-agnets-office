// market-tools.js — 이서연(Market Agent)용 Claude tool_use 도구 정의

const MARKET_AGENT_TOOLS = [
  {
    name: 'query_competitors',
    description: `경쟁사 상품 데이터를 검색합니다.
5개 브랜드의 신상품 데이터를 필터링하여 조회합니다.

브랜드: Alo Yoga (254개), Wilson (115개), Sergio Tacchini (50개), Ralph Lauren (246개), Lacoste (191개)
총 856개 상품, Claude Vision AI로 분석된 스타일/소재/감성 데이터 포함.

반환 항목: 브랜드, 상품명, 가격, 색상수, 중분류, 소분류, 소재유형, RA/SB/GU, 기장, 핏`,
    input_schema: {
      type: 'object',
      properties: {
        brand: {
          type: 'string',
          description: '브랜드 필터 (예: "Alo Yoga", "Wilson", "Ralph Lauren", "Lacoste", "Sergio")'
        },
        category: {
          type: 'string',
          description: '카테고리 필터 — 대/중/소분류 검색 (예: "상의", "하의", "레깅스", "자켓")'
        },
        fabric: {
          type: 'string',
          description: '소재유형 필터 (예: "져지", "우븐", "스웨터", "실크")'
        },
        priceMin: { type: 'number', description: '최소 가격 (원)' },
        priceMax: { type: 'number', description: '최대 가격 (원)' },
        keyword: { type: 'string', description: '상품명 키워드 검색' },
        sortBy: {
          type: 'string',
          enum: ['price_asc', 'price_desc', 'ra_desc'],
          description: '정렬 기준'
        },
        limit: { type: 'number', description: '최대 반환 수 (기본 50, 최대 100)' }
      },
      required: []
    }
  },
  {
    name: 'get_brand_summary',
    description: `특정 브랜드 또는 전체 브랜드의 요약 통계를 반환합니다.
포함 항목: 상품 수, 가격 통계(평균/최소/최대), Vision 감성 평균(RA/SB/GU), 평균 색상 옵션 수, 소분류 분포, 소재유형 분포`,
    input_schema: {
      type: 'object',
      properties: {
        brand: {
          type: 'string',
          description: '특정 브랜드 이름 (생략 시 전체 브랜드 요약)'
        }
      },
      required: []
    }
  },
  {
    name: 'compare_brands',
    description: `브랜드 간 특정 지표를 비교합니다.
지표: price(가격), category(소분류 구성), vision(RA/SB/GU 감성), fabric(소재유형 분포)`,
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['price', 'category', 'vision', 'fabric'],
          description: 'price=가격비교, category=소분류구성, vision=감성비교, fabric=소재유형'
        }
      },
      required: ['metric']
    }
  }
];

module.exports = { MARKET_AGENT_TOOLS };
