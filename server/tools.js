// tools.js — 최재원(Data Analyst)용 Claude tool_use 도구 정의

// Claude API에 전달할 tool 스펙
const DATA_ANALYST_TOOLS = [
  {
    name: 'query_snowflake',
    description: `Snowflake DB에서 SELECT 쿼리를 실행합니다.
대상 테이블: FNF.PRCS.DB_SCS_W (주차별 판매/입고/재고 데이터)

주요 차원 컬럼:
- START_DT (DATE, 주 시작일=월요일), END_DT (DATE, 주 종료일=일요일)
- BRD_CD (브랜드, 현재 'ST'=Sergio Tacchini만 존재)
- SESN (시즌), PART_CD (파트), PRDT_CD (상품코드), COLOR_CD, SIZE_CD

주요 채널 접미사:
- CNS (위탁합계, RTL+NOTAX 포함 → 다른채널과 중복집계 주의!)
- WSL (사입), DOME (도매), CHN (중국), GVL (글로벌), HMD (홍마대), TV (태베)
- ※ 비중복 전체합: CNS + WSL + DOME + CHN + GVL + HMD + TV

주요 지표 패턴 (채널 접미사를 붙여 사용):
- SALE_NML_QTY_{ch} + SALE_RET_QTY_{ch} = 순판매수량 (RET은 음수)
- SALE_NML_TAG_AMT_{ch} + SALE_RET_TAG_AMT_{ch} = TAG기준매출
- SALE_NML_SALE_AMT_{ch} + SALE_RET_SALE_AMT_{ch} = 실제판매금액
- SALE_NML_SUPP_AMT_{ch} + SALE_RET_SUPP_AMT_{ch} = 공급가매출
- DELV_NML_QTY_{ch} / DELV_RET_QTY_{ch} = 입고/반입 수량
- STOR_QTY / STOR_TAG_AMT = 입고수량/입고TAG금액
- STOCK_QTY / STOCK_TAG_AMT = 재고수량/재고TAG금액
- AC_ 접두사 = 누적(Accumulated) 버전

데이터 범위: 2022-10 ~ 현재, 주차별 약 81만행
제약: SELECT만 가능, 최대 200행 반환, 30초 타임아웃`,
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: '실행할 SELECT SQL 쿼리. FNF.PRCS.DB_SCS_W 테이블 대상.'
        },
        purpose: {
          type: 'string',
          description: '이 쿼리를 실행하는 이유 (분석 컨텍스트)'
        }
      },
      required: ['sql', 'purpose']
    }
  },
  {
    name: 'get_weekly_summary',
    description: `최근 N주간 주차별 채널별 판매 요약을 가져옵니다.
전체 채널 합계(비중복)와 주요 채널별 실적을 한번에 조회합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        weeks: {
          type: 'number',
          description: '조회할 최근 주 수 (기본 4, 최대 12)'
        },
        metric: {
          type: 'string',
          enum: ['sale_qty', 'sale_amt', 'tag_amt'],
          description: 'sale_qty=순판매수량, sale_amt=실제판매금액, tag_amt=TAG매출'
        }
      },
      required: ['weeks', 'metric']
    }
  }
];

// get_weekly_summary용 SQL 생성
function buildWeeklySummarySQL(weeks, metric) {
  weeks = Math.min(Math.max(1, weeks || 4), 12);

  const metricMap = {
    sale_qty: { nml: 'SALE_NML_QTY', ret: 'SALE_RET_QTY', label: '순판매수량' },
    sale_amt: { nml: 'SALE_NML_SALE_AMT', ret: 'SALE_RET_SALE_AMT', label: '실제판매금액' },
    tag_amt: { nml: 'SALE_NML_TAG_AMT', ret: 'SALE_RET_TAG_AMT', label: 'TAG매출' },
  };

  const m = metricMap[metric] || metricMap.sale_amt;
  const channels = ['CNS', 'WSL', 'DOME', 'CHN', 'GVL', 'HMD', 'TV'];

  const channelCols = channels.map(ch =>
    `SUM(${m.nml}_${ch} + ${m.ret}_${ch}) AS ${ch}`
  ).join(',\n    ');

  const totalExpr = channels.map(ch =>
    `SUM(${m.nml}_${ch} + ${m.ret}_${ch})`
  ).join(' + ');

  return `SELECT
    START_DT, END_DT,
    ${channelCols},
    ${totalExpr} AS TOTAL
  FROM FNF.PRCS.DB_SCS_W
  WHERE BRD_CD = 'ST'
  GROUP BY START_DT, END_DT
  ORDER BY START_DT DESC
  LIMIT ${weeks}`;
}

module.exports = { DATA_ANALYST_TOOLS, buildWeeklySummarySQL };
