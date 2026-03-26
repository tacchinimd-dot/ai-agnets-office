// product-tools.js — 박도현(Product Planning MD)용 Claude tool_use 도구 정의

const PRODUCT_PLANNING_TOOLS = [
  {
    name: 'query_product_db',
    description: `Snowflake에서 상품 기획 관련 데이터를 SELECT 쿼리로 조회합니다.

사용 가능한 테이블:

1. FNF.PRCS.DB_PRDT — 상품 마스터 (26,500개, 129컬럼)
   핵심 컬럼: PRDT_CD, STYLE_CD, PRDT_NM, BRD_CD, SESN, ITEM(아이템코드), ITEM_NM,
   PRDT_KIND_CD/NM(상품종류), PARENT_PRDT_KIND_CD/NM(상위종류), SEX/SEX_NM(성별),
   TAG_PRICE, FAB_TYPE/FAB_TYPE_NM(소재유형), MIX_RATE(혼용률), FIT_USR/FIT_USR_NM(핏),
   CAT/CAT_NM(카테고리), SUB_CAT/SUB_CAT_NM(서브카테고리), SUB_CAT_DTL/SUB_CAT_DTL_NM,
   ORD_QTY(발주수량), COLOR_CNT(색상수), ORIGIN/ORIGIN_NM(원산지),
   LENGTH_CD/LENGTH_NM(기장), DSGNR_NM(디자이너), SALE_DT_1ST(최초판매일)
   BRD_CD: 'ST'=Sergio Tacchini

2. FNF.MKT.CTGR_SALES_W — 카테고리별 주차 판매+재고 (350,190행)
   컬럼: START_DT, STOCK_START_DT, STOCK_END_DT, BRD_CD, SESN,
   CAT_NM, SUB_CAT_NM, TOTAL_SALE_QTY, TOTAL_SALE_AMT,
   DOMESTIC_SALE_QTY, DOMESTIC_SALE_AMT, STOCK_QTY, WH_STOCK_QTY, SH_STOCK_QTY, AVG4_STOCK_QTY

3. FNF.PRCS.DB_COST_MST — 원가 마스터 (69,109행)
   컬럼: PRDT_CD, BRD_CD, SESN, PART_CD, QTY, ORIGIN,
   TAG_AMT(TAG가), HQ_SUPPLY_AMT(본사공급가), MFAC_COST_AMT(공장원가),
   MARKUP(마크업), FOB_COST, EXCHAGE_RATE(환율), MFAC_COMPY_NM(공장명)

4. FNF.MKT.DM_FNF_PRDT_RNK_W — 자사 상품 판매 랭킹 (166,866행)
   컬럼: START_DT, END_DT, BRD_CD, GENDER, NEW_CAT1/2/3,
   RNK(순위), STYLE_CD, PRDT_NM, MOV(변동), TAG_PRICE, CUR_SALE_AMT(판매금액)

5. FNF.PRCS.DB_SCS_STOCK — 재고 현황 (252,460행)

6. FNF.PRCS.DW_PRDT_PRICE — 채널별 가격 (48,024행)
   컬럼: MALL_ID, PRDT_CD, TAG_PRICE, SALE_PRICE

7. FNF.PRCS.DB_PRDT_SIMILAR_ML — ML 유사상품 (52,134행)
   컬럼: BRD_CD, STYLE_CD, SIMILAR_STYLE_CD, RANKING

제약: SELECT만 가능, 최대 200행, 30초 타임아웃.`,
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: '실행할 SELECT SQL 쿼리'
        },
        purpose: {
          type: 'string',
          description: '이 쿼리를 실행하는 이유 (기획 컨텍스트)'
        }
      },
      required: ['sql', 'purpose']
    }
  },
  {
    name: 'get_category_performance',
    description: `카테고리별 최근 N주 판매+재고 성과를 조회합니다.
어떤 카테고리를 강화/축소할지 판단하는 데 활용합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        weeks: {
          type: 'number',
          description: '조회할 최근 주 수 (기본 4, 최대 12)'
        },
        category: {
          type: 'string',
          description: '특정 카테고리만 필터 (생략 시 전체)'
        }
      },
      required: ['weeks']
    }
  },
  {
    name: 'get_top_selling_styles',
    description: `최근 주차 자사 상품 판매 랭킹 TOP N을 조회합니다.
어떤 스타일이 잘 팔리는지, 공통 패턴은 무엇인지 파악합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '조회할 상위 N개 (기본 20, 최대 50)'
        },
        gender: {
          type: 'string',
          description: '성별 필터 (예: "남성", "여성", 생략 시 전체)'
        },
        category: {
          type: 'string',
          description: '카테고리 필터 (예: "상의", "하의", 생략 시 전체)'
        }
      },
      required: []
    }
  }
];

// get_category_performance용 SQL
function buildCategoryPerformanceSQL(weeks, category) {
  weeks = Math.min(Math.max(1, weeks || 4), 12);
  const catFilter = category ? `AND CAT_NM LIKE '%${category.replace(/'/g, "''")}%'` : '';

  return `SELECT
    START_DT, CAT_NM, SUB_CAT_NM,
    SUM(TOTAL_SALE_QTY) AS SALE_QTY,
    SUM(TOTAL_SALE_AMT) AS SALE_AMT,
    SUM(STOCK_QTY) AS STOCK_QTY,
    SUM(WH_STOCK_QTY) AS WH_STOCK,
    SUM(SH_STOCK_QTY) AS SH_STOCK
  FROM FNF.MKT.CTGR_SALES_W
  WHERE BRD_CD = 'ST' ${catFilter}
  GROUP BY START_DT, CAT_NM, SUB_CAT_NM
  ORDER BY START_DT DESC, SALE_AMT DESC
  LIMIT ${weeks * 30}`;
}

// get_top_selling_styles용 SQL
function buildTopSellingSQL(limit, gender, category) {
  limit = Math.min(Math.max(1, limit || 20), 50);
  const genderFilter = gender ? `AND GENDER LIKE '%${gender.replace(/'/g, "''")}%'` : '';
  const catFilter = category ? `AND (NEW_CAT1 LIKE '%${category.replace(/'/g, "''")}%' OR NEW_CAT2 LIKE '%${category.replace(/'/g, "''")}%')` : '';

  return `SELECT
    r.START_DT, r.RNK, r.STYLE_CD, r.PRDT_NM, r.TAG_PRICE, r.CUR_SALE_AMT, r.MOV,
    r.GENDER, r.NEW_CAT1, r.NEW_CAT2
  FROM FNF.MKT.DM_FNF_PRDT_RNK_W r
  WHERE r.BRD_CD = 'ST'
    AND r.START_DT = (SELECT MAX(START_DT) FROM FNF.MKT.DM_FNF_PRDT_RNK_W WHERE BRD_CD='ST')
    ${genderFilter} ${catFilter}
  ORDER BY r.RNK ASC
  LIMIT ${limit}`;
}

module.exports = { PRODUCT_PLANNING_TOOLS, buildCategoryPerformanceSQL, buildTopSellingSQL };
