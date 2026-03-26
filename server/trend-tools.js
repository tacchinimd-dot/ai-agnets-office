// trend-tools.js — 김하늘(Consumer Trend Agent)용 Claude tool_use 도구 정의

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ── 크롤러 경로 ──────────────────────────────────────────────────────────────

const MUSINSA_DIR = path.join(__dirname, '..', 'Consumer Trend Agent', 'musinsa_rank');
const MUSINSA_SCRIPT = path.join(MUSINSA_DIR, 'musinsa_ranking_crawler.py');
let lastMusinsaCrawl = null;

const TIKTOK_DIR = path.join(__dirname, '..', 'Consumer Trend Agent', 'tiktok_hashtag_crawler');
const TIKTOK_SCRIPT = path.join(TIKTOK_DIR, 'tiktok_hashtag_crawler.py');
const TIKTOK_OUTPUT = path.join(TIKTOK_DIR, 'output');
let lastTiktokCrawl = null;

// ── 데이터 로드 ──────────────────────────────────────────────────────────────

let rankings = [];
let dataLoadedAt = null;

function loadMusinsaData() {
  // 프로젝트 내 번들 데이터 우선, 없으면 Consumer Trend Agent 폴더
  const bundlePath = path.join(__dirname, 'data', 'musinsa_ranking.json');
  const localPath = path.join(__dirname, '..', 'Consumer Trend Agent', 'musinsa_rank', 'musinsa_ranking_data.json');

  const filePath = fs.existsSync(bundlePath) ? bundlePath : fs.existsSync(localPath) ? localPath : null;

  if (!filePath) {
    console.log('  [무신사] 데이터 파일 없음');
    return { total: 0, error: '무신사 데이터 파일 없음' };
  }

  rankings = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  dataLoadedAt = new Date().toISOString();
  console.log(`  [무신사] ${filePath} → ${rankings.length}개 상품`);
  return { total: rankings.length };
}

// ── 쿼리 함수들 ──────────────────────────────────────────────────────────────

function queryRanking(filters = {}) {
  let result = [...rankings];

  if (filters.category) {
    const c = filters.category;
    result = result.filter(r => r.category === c);
  }
  if (filters.brand) {
    const b = filters.brand.toLowerCase();
    result = result.filter(r => r.brandName.toLowerCase().includes(b));
  }
  if (filters.keyword) {
    const k = filters.keyword.toLowerCase();
    result = result.filter(r => r.productName.toLowerCase().includes(k) || r.brandName.toLowerCase().includes(k));
  }
  if (filters.risingOnly) {
    result = result.filter(r => r.isRising);
  }
  if (filters.minRank) result = result.filter(r => r.rank >= filters.minRank);
  if (filters.maxRank) result = result.filter(r => r.rank <= filters.maxRank);

  // 정렬
  if (filters.sortBy === 'sales') result.sort((a, b) => (b.purchaseTotal || 0) - (a.purchaseTotal || 0));
  else if (filters.sortBy === 'views') result.sort((a, b) => (b.pageViewTotal || 0) - (a.pageViewTotal || 0));
  else if (filters.sortBy === 'conversion') {
    result.sort((a, b) => {
      const ca = a.pageViewTotal ? a.purchaseTotal / a.pageViewTotal : 0;
      const cb = b.pageViewTotal ? b.purchaseTotal / b.pageViewTotal : 0;
      return cb - ca;
    });
  } else {
    result.sort((a, b) => a.rank - b.rank);
  }

  const limit = Math.min(filters.limit || 30, 100);
  return {
    total: result.length,
    items: result.slice(0, limit).map(r => ({
      rank: r.rank,
      brand: r.brandName,
      name: r.productName,
      price: r.finalPrice,
      originalPrice: r.originalPrice,
      discount: r.discountRatio,
      category: r.category,
      isRising: r.isRising,
      sales: r.purchaseTotal || 0,
      views: r.pageViewTotal || 0,
      conversion: r.pageViewTotal ? +((r.purchaseTotal / r.pageViewTotal) * 100).toFixed(2) : 0,
    })),
  };
}

function getRankingSummary() {
  // 카테고리별 분포
  const catDist = {};
  rankings.forEach(r => { catDist[r.category || '미분류'] = (catDist[r.category || '미분류'] || 0) + 1; });

  // 브랜드별 분포 (다수 등장 브랜드)
  const brandCount = {};
  rankings.forEach(r => { brandCount[r.brandName] = (brandCount[r.brandName] || 0) + 1; });
  const topBrands = Object.entries(brandCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  // 가격 통계
  const prices = rankings.map(r => r.finalPrice).filter(p => p > 0);
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  // 급상승 상품
  const risingCount = rankings.filter(r => r.isRising).length;

  // 할인 통계
  const discounts = rankings.map(r => r.discountRatio).filter(d => d > 0);
  const avgDiscount = discounts.length ? +(discounts.reduce((a, b) => a + b, 0) / discounts.length).toFixed(1) : 0;

  // 전환율 TOP 5
  const topConversion = [...rankings]
    .filter(r => r.pageViewTotal > 0 && r.purchaseTotal > 0)
    .map(r => ({
      rank: r.rank, brand: r.brandName, name: r.productName,
      conversion: +((r.purchaseTotal / r.pageViewTotal) * 100).toFixed(2),
      sales: r.purchaseTotal,
    }))
    .sort((a, b) => b.conversion - a.conversion)
    .slice(0, 5);

  return {
    totalProducts: rankings.length,
    dataDate: dataLoadedAt,
    categoryDistribution: catDist,
    topBrands,
    priceStats: { avg: avgPrice, min: Math.min(...prices), max: Math.max(...prices) },
    risingCount,
    avgDiscount,
    topConversion,
  };
}

function getCategoryTrend(category) {
  const items = rankings.filter(r => r.category === category);
  if (!items.length) return { error: `'${category}' 카테고리 상품 없음` };

  const prices = items.map(r => r.finalPrice).filter(p => p > 0);
  const brandCount = {};
  items.forEach(r => { brandCount[r.brandName] = (brandCount[r.brandName] || 0) + 1; });

  return {
    category,
    count: items.length,
    priceStats: {
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      min: Math.min(...prices),
      max: Math.max(...prices),
    },
    topBrands: Object.entries(brandCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    risingCount: items.filter(r => r.isRising).length,
    items: items.sort((a, b) => a.rank - b.rank).slice(0, 10).map(r => ({
      rank: r.rank, brand: r.brandName, name: r.productName,
      price: r.finalPrice, discount: r.discountRatio,
      sales: r.purchaseTotal || 0,
    })),
  };
}

// ── TikTok 데이터 ────────────────────────────────────────────────────────────

let tiktokHashtags = [];
let tiktokLoadedAt = null;

function loadTiktokData() {
  const latestPath = path.join(TIKTOK_OUTPUT, 'tiktok_hashtags_latest.json');
  const bundlePath = path.join(__dirname, 'data', 'tiktok_hashtags.json');

  const filePath = fs.existsSync(latestPath) ? latestPath : fs.existsSync(bundlePath) ? bundlePath : null;
  if (!filePath) {
    console.log('  [TikTok] 데이터 파일 없음');
    return { total: 0 };
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  tiktokHashtags = raw.hashtags || [];
  tiktokLoadedAt = raw.crawled_at || new Date().toISOString();
  console.log(`  [TikTok] ${filePath} → ${tiktokHashtags.length}개 해시태그`);
  return { total: tiktokHashtags.length };
}

function queryTiktokHashtags(filters = {}) {
  let result = [...tiktokHashtags];

  if (filters.keyword) {
    const k = filters.keyword.toLowerCase();
    result = result.filter(r => r.hashtag.toLowerCase().includes(k));
  }
  if (filters.newOnly) {
    result = result.filter(r => r.rank_diff_type === 2);
  }
  if (filters.risingOnly) {
    result = result.filter(r => r.rank_diff_type === 1);
  }
  if (filters.minRank) result = result.filter(r => r.rank >= filters.minRank);
  if (filters.maxRank) result = result.filter(r => r.rank <= filters.maxRank);

  if (filters.sortBy === 'views') result.sort((a, b) => (b.video_views || 0) - (a.video_views || 0));
  else if (filters.sortBy === 'posts') result.sort((a, b) => (b.posts || 0) - (a.posts || 0));
  else result.sort((a, b) => a.rank - b.rank);

  const limit = Math.min(filters.limit || 30, 100);
  return {
    total: result.length,
    crawledAt: tiktokLoadedAt,
    items: result.slice(0, limit).map(r => ({
      rank: r.rank,
      hashtag: r.hashtag,
      posts: r.posts,
      views: r.video_views,
      rankDiff: r.rank_diff,
      diffType: r.rank_diff_type === 1 ? 'rising' : r.rank_diff_type === 2 ? 'new' : r.rank_diff_type === 3 ? 'falling' : 'same',
      isPromoted: r.is_promoted,
    })),
  };
}

function getTiktokSummary() {
  const newCount = tiktokHashtags.filter(r => r.rank_diff_type === 2).length;
  const risingCount = tiktokHashtags.filter(r => r.rank_diff_type === 1).length;
  const fallingCount = tiktokHashtags.filter(r => r.rank_diff_type === 3).length;

  const topByViews = [...tiktokHashtags]
    .sort((a, b) => (b.video_views || 0) - (a.video_views || 0))
    .slice(0, 10)
    .map(r => ({ rank: r.rank, hashtag: r.hashtag, views: r.video_views, posts: r.posts }));

  const topByPosts = [...tiktokHashtags]
    .sort((a, b) => (b.posts || 0) - (a.posts || 0))
    .slice(0, 10)
    .map(r => ({ rank: r.rank, hashtag: r.hashtag, posts: r.posts, views: r.video_views }));

  return {
    total: tiktokHashtags.length,
    crawledAt: tiktokLoadedAt,
    newEntries: newCount,
    risingCount,
    fallingCount,
    topByViews,
    topByPosts,
  };
}

// ── 도구 정의 ────────────────────────────────────────────────────────────────

const TREND_AGENT_TOOLS = [
  {
    name: 'query_musinsa_ranking',
    description: `무신사 일간 랭킹 Top 100 상품 데이터를 검색합니다.
각 상품의 순위, 브랜드, 가격, 할인율, 카테고리, 누적판매량, 총조회수, 전환율 데이터를 제공합니다.
카테고리: 상의, 바지, 아우터, 원피스/스커트, 신발, 가방, 모자, 액세서리, 속옷/잠옷, 뷰티, 식품/보충제`,
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '카테고리 필터 (예: "상의", "바지", "아우터")' },
        brand: { type: 'string', description: '브랜드명 검색' },
        keyword: { type: 'string', description: '상품명/브랜드명 키워드 검색' },
        risingOnly: { type: 'boolean', description: 'true면 급상승 상품만 필터' },
        minRank: { type: 'number', description: '최소 순위 (예: 1)' },
        maxRank: { type: 'number', description: '최대 순위 (예: 10 = Top 10만)' },
        sortBy: {
          type: 'string',
          enum: ['rank', 'sales', 'views', 'conversion'],
          description: '정렬 기준 (기본: rank)'
        },
        limit: { type: 'number', description: '최대 반환 수 (기본 30)' },
      },
      required: []
    }
  },
  {
    name: 'get_musinsa_summary',
    description: `무신사 랭킹 전체 요약 통계를 반환합니다.
카테고리 분포, 인기 브랜드 TOP 15, 가격 통계, 급상승 수, 평균 할인율, 전환율 TOP 5`,
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_category_trend',
    description: `특정 카테고리의 트렌드를 상세 분석합니다.
해당 카테고리의 상품 수, 가격 통계, 주요 브랜드, 급상승 수, TOP 10 상품 목록`,
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '분석할 카테고리 (예: "상의", "바지", "아우터", "신발")'
        }
      },
      required: ['category']
    }
  },

  // ── Snowflake 키워드 트렌드 도구 ────────────────────────────────────────────

  {
    name: 'query_naver_keywords',
    description: `네이버 검색 키워드 데이터를 Snowflake에서 조회합니다 (SELECT 쿼리).

대상 테이블들:
1. FNF.PRCS.DB_SRCH_KWD_NAVER_W — 네이버 주차별 검색량 (10년치, 22,134 키워드)
   컬럼: START_DT(DATE), END_DT(DATE), KWD(TEXT), DVC('pc'/'mo'), SRCH_CNT(NUMBER)

2. FNF.MKT.DM_NAVER_KWD_RANK_W — 브랜드별 키워드 순위
   컬럼: BRD_CD, NEW_CAT1/2/3, RANK_THIS, KWD_NM, RANKING, CNT_THIS, CNT_LAST, UPDATE_DT

3. FNF.MKT.MW_NAVER_SHOPPING_TREND_KWD — 네이버 쇼핑 트렌드 키워드
   컬럼: DT, AGE_GENDER, MAIN_CATEGORY, MID_CATEGORY, SUB_CATEGORY, RANK, KWD, MOVEMENT

4. FNF.MKT.DW_NAVER_SHOPPING_BRD_RNK — 네이버 쇼핑 브랜드 랭킹
   컬럼: MAIN_CATEGORY, MID_CATEGORY, SUB_CATEGORY, GENDER_FILTER, RANKING, KEYWORD, MOVEMENT, UPDATE_DATE

제약: SELECT만 가능, 최대 200행, 30초 타임아웃.
DVC는 'pc' 또는 'mo'. 전체 합산 시 pc+mo를 GROUP BY KWD로 합산.
주차 비교 시 START_DT 기준으로 최근 주 vs 전주를 비교하면 상승/하락 키워드를 도출할 수 있음.`,
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: '실행할 SELECT SQL 쿼리'
        },
        purpose: {
          type: 'string',
          description: '이 쿼리를 실행하는 이유'
        }
      },
      required: ['sql', 'purpose']
    }
  },
  // ── TikTok 도구 ──
  {
    name: 'query_tiktok_hashtags',
    description: `TikTok 인기 해시태그 Top 100 데이터를 검색합니다 (글로벌 기준, 7일 기간).
각 해시태그의 순위, 게시물 수, 총 조회수, 순위 변동(상승/신규/하락/유지) 데이터를 제공합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '해시태그 키워드 검색' },
        newOnly: { type: 'boolean', description: 'true면 신규 진입 해시태그만' },
        risingOnly: { type: 'boolean', description: 'true면 상승 중인 해시태그만' },
        maxRank: { type: 'number', description: '상위 N위까지만 (예: 20 = Top 20)' },
        sortBy: {
          type: 'string',
          enum: ['rank', 'views', 'posts'],
          description: '정렬 기준 (기본: rank)'
        },
        limit: { type: 'number', description: '최대 반환 수 (기본 30)' },
      },
      required: []
    }
  },
  {
    name: 'get_tiktok_summary',
    description: `TikTok 트렌딩 해시태그 전체 요약을 반환합니다.
신규 진입 수, 상승/하락 수, 조회수 TOP 10, 게시물수 TOP 10`,
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'run_tiktok_crawler',
    description: `TikTok 해시태그 크롤러를 실행합니다. 글로벌 인기 해시태그 Top 100을 수집합니다.
주 1회만 실행 가능합니다. 실행 시 약 30~40초 소요됩니다.`,
    input_schema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: '크롤링 실행 확인 (true 필수)' }
      },
      required: ['confirm']
    }
  },
  // ── 무신사 도구 ──
  {
    name: 'run_musinsa_crawler',
    description: `무신사 랭킹 크롤러를 실행합니다. Top 100 상품의 최신 데이터를 수집합니다.
주 1회만 실행 가능합니다. 실행 시 약 20~30초 소요됩니다.
크롤링 완료 후 자동으로: JSON 데이터 갱신, 히스토리 누적, 대시보드 HTML 업데이트.
이전 데이터는 대시보드의 날짜 탭에서 계속 확인 가능합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: '크롤링 실행을 확인합니다 (true 필수)'
        }
      },
      required: ['confirm']
    }
  },
  {
    name: 'get_rising_keywords',
    description: `최근 2주간 검색량 변화를 비교하여 급상승/급하락 키워드를 자동 산출합니다.
pc+mo 합산 기준, 전주 대비 증감률로 정렬합니다.`,
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['rising', 'falling'],
          description: 'rising=급상승, falling=급하락'
        },
        limit: {
          type: 'number',
          description: '반환 수 (기본 20)'
        }
      },
      required: ['direction']
    }
  }
];

// get_rising_keywords용 SQL 생성
function buildRisingKeywordsSQL(direction, limit) {
  limit = Math.min(Math.max(1, limit || 20), 50);
  const orderDir = direction === 'falling' ? 'ASC' : 'DESC';

  return `WITH recent_weeks AS (
  SELECT DISTINCT START_DT
  FROM FNF.PRCS.DB_SRCH_KWD_NAVER_W
  ORDER BY START_DT DESC
  LIMIT 2
),
this_week AS (
  SELECT KWD, SUM(SRCH_CNT) AS cnt
  FROM FNF.PRCS.DB_SRCH_KWD_NAVER_W
  WHERE START_DT = (SELECT MAX(START_DT) FROM recent_weeks)
  GROUP BY KWD
),
last_week AS (
  SELECT KWD, SUM(SRCH_CNT) AS cnt
  FROM FNF.PRCS.DB_SRCH_KWD_NAVER_W
  WHERE START_DT = (SELECT MIN(START_DT) FROM recent_weeks)
  GROUP BY KWD
)
SELECT
  t.KWD,
  t.cnt AS THIS_WEEK,
  COALESCE(l.cnt, 0) AS LAST_WEEK,
  t.cnt - COALESCE(l.cnt, 0) AS DIFF,
  CASE WHEN COALESCE(l.cnt, 0) > 0
    THEN ROUND((t.cnt - l.cnt) * 100.0 / l.cnt, 1)
    ELSE 9999
  END AS CHANGE_PCT
FROM this_week t
LEFT JOIN last_week l ON t.KWD = l.KWD
WHERE t.cnt >= 100
ORDER BY CHANGE_PCT ${orderDir}
LIMIT ${limit}`;
}

// ── 크롤러 실행 ──────────────────────────────────────────────────────────────

function canRunCrawler() {
  if (!lastMusinsaCrawl) {
    // 히스토리 파일에서 마지막 크롤 날짜 확인
    const historyPath = path.join(MUSINSA_DIR, 'musinsa_ranking_history.json');
    if (fs.existsSync(historyPath)) {
      try {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        if (history.length > 0) {
          lastMusinsaCrawl = history[0].date; // 최신 날짜
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (!lastMusinsaCrawl) return { allowed: true };

  const last = new Date(lastMusinsaCrawl);
  const now = new Date();
  const diffDays = (now - last) / (1000 * 60 * 60 * 24);

  if (diffDays < 7) {
    const nextDate = new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      allowed: false,
      reason: `마지막 크롤링: ${lastMusinsaCrawl}. 주 1회 제한으로 ${nextDate.toISOString().slice(0, 10)} 이후에 실행 가능합니다.`,
      lastCrawl: lastMusinsaCrawl,
      nextAllowed: nextDate.toISOString().slice(0, 10),
    };
  }

  return { allowed: true };
}

function runMusinsaCrawler() {
  return new Promise((resolve, reject) => {
    const check = canRunCrawler();
    if (!check.allowed) {
      resolve({ success: false, ...check });
      return;
    }

    if (!fs.existsSync(MUSINSA_SCRIPT)) {
      resolve({ success: false, reason: '크롤러 스크립트를 찾을 수 없습니다: ' + MUSINSA_SCRIPT });
      return;
    }

    console.log('[Crawler] 무신사 랭킹 크롤러 실행 중...');

    execFile('python', [MUSINSA_SCRIPT], {
      cwd: MUSINSA_DIR,
      timeout: 120000, // 2분 타임아웃
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Crawler Error]', err.message);
        resolve({ success: false, reason: `크롤러 실행 오류: ${err.message}`, stderr });
        return;
      }

      console.log('[Crawler] 완료:', stdout.slice(-200));

      // 데이터 리로드
      const reloadResult = loadMusinsaData();
      lastMusinsaCrawl = new Date().toISOString().slice(0, 10);

      // server/data/ 번들도 갱신
      const bundleDest = path.join(__dirname, 'data', 'musinsa_ranking.json');
      const srcData = path.join(MUSINSA_DIR, 'musinsa_ranking_data.json');
      if (fs.existsSync(srcData)) {
        try { fs.copyFileSync(srcData, bundleDest); } catch (e) { /* ignore */ }
      }

      resolve({
        success: true,
        date: lastMusinsaCrawl,
        productsLoaded: reloadResult.total,
        output: stdout.slice(-500),
      });
    });
  });
}

// ── TikTok 크롤러 실행 ───────────────────────────────────────────────────────

function canRunTiktokCrawler() {
  if (!lastTiktokCrawl) {
    // latest.json의 crawled_at에서 확인
    const latestPath = path.join(TIKTOK_OUTPUT, 'tiktok_hashtags_latest.json');
    if (fs.existsSync(latestPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
        if (data.crawled_at) {
          lastTiktokCrawl = data.crawled_at.slice(0, 10);
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (!lastTiktokCrawl) return { allowed: true };

  const last = new Date(lastTiktokCrawl);
  const now = new Date();
  const diffDays = (now - last) / (1000 * 60 * 60 * 24);

  if (diffDays < 7) {
    const nextDate = new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      allowed: false,
      reason: `마지막 크롤링: ${lastTiktokCrawl}. 주 1회 제한으로 ${nextDate.toISOString().slice(0, 10)} 이후에 실행 가능합니다.`,
      lastCrawl: lastTiktokCrawl,
      nextAllowed: nextDate.toISOString().slice(0, 10),
    };
  }

  return { allowed: true };
}

function runTiktokCrawler() {
  return new Promise((resolve, reject) => {
    const check = canRunTiktokCrawler();
    if (!check.allowed) {
      resolve({ success: false, ...check });
      return;
    }

    if (!fs.existsSync(TIKTOK_SCRIPT)) {
      resolve({ success: false, reason: '크롤러 스크립트를 찾을 수 없습니다: ' + TIKTOK_SCRIPT });
      return;
    }

    console.log('[Crawler] TikTok 해시태그 크롤러 실행 중...');

    execFile('python', [TIKTOK_SCRIPT], {
      cwd: TIKTOK_DIR,
      timeout: 120000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Crawler Error]', err.message);
        resolve({ success: false, reason: `크롤러 실행 오류: ${err.message}`, stderr });
        return;
      }

      console.log('[Crawler] TikTok 완료:', stdout.slice(-200));

      // 데이터 리로드
      const reloadResult = loadTiktokData();
      lastTiktokCrawl = new Date().toISOString().slice(0, 10);

      // 번들 갱신
      const bundleDest = path.join(__dirname, 'data', 'tiktok_hashtags.json');
      const srcData = path.join(TIKTOK_OUTPUT, 'tiktok_hashtags_latest.json');
      if (fs.existsSync(srcData)) {
        try { fs.copyFileSync(srcData, bundleDest); } catch (e) { /* ignore */ }
      }

      resolve({
        success: true,
        date: lastTiktokCrawl,
        hashtagsLoaded: reloadResult.total,
        output: stdout.slice(-500),
      });
    });
  });
}

module.exports = {
  TREND_AGENT_TOOLS,
  loadMusinsaData,
  loadTiktokData,
  queryRanking,
  getRankingSummary,
  getCategoryTrend,
  queryTiktokHashtags,
  getTiktokSummary,
  buildRisingKeywordsSQL,
  runMusinsaCrawler,
  runTiktokCrawler,
};
