// trend-tools.js — 김하늘(Consumer Trend Agent)용 Claude tool_use 도구 정의

const fs = require('fs');
const path = require('path');

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
  }
];

module.exports = {
  TREND_AGENT_TOOLS,
  loadMusinsaData,
  queryRanking,
  getRankingSummary,
  getCategoryTrend,
};
