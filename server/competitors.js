// competitors.js — 경쟁사 데이터 로더 (로컬 Excel/JSON → 메모리)

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CRAWLER_ROOT = 'C:\\Users\\AD0903\\brand_crawler';

// 통일 데이터 저장소
let products = [];
let loadedAt = null;

// ── 파일 탐색 유틸 ──────────────────────────────────────────────────────────

function latestFile(dir, pattern) {
  const files = fs.readdirSync(dir)
    .filter(f => pattern.test(f))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

// ── Excel 로더 (Alo, Wilson) ────────────────────────────────────────────────

function loadExcel(filePath, brand) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows
    .filter(r => r['상품명'] || r['PRODUCT_NAME'])
    .map(r => normalizeExcelRow(r, brand));
}

function normalizeExcelRow(r, brand) {
  const name = r['상품명'] || r['PRODUCT_NAME'] || '';
  const rawPrice = r['가격'] || r['PRICE'] || '';
  const colorStr = r['색상 옵션'] || r['COLOR_OPTIONS'] || '';
  const colors = colorStr ? String(colorStr).split(',').map(c => c.trim()).filter(Boolean) : [];

  return {
    brand,
    name,
    price: parsePrice(rawPrice),
    priceRaw: String(rawPrice),
    colors,
    colorsCnt: colors.length,
    main: r['대분류'] || r['CATEGORY_MAIN'] || '의류',
    mid: r['중분류'] || r['CATEGORY_MID'] || '',
    sub: r['소분류'] || r['CATEGORY_SUB'] || '',
    fabric: r['소재유형'] || r['FABRIC'] || r['FABRIC_TYPE'] || '',
    image: r['대표 이미지 URL'] || r['IMAGE_URL'] || '',
    url: r['상품 URL'] || r['PRODUCT_URL'] || '',
    RA: toInt(r['RA(질감)'] || r['VISION_RA']),
    SB: toInt(r['SB(형태)'] || r['VISION_SB']),
    GU: toInt(r['GU(광택)'] || r['VISION_GU']),
    reason: r['Vision 근거'] || r['VISION_REASON'] || '',
    length: r['기장'] || r['VISION_LENGTH'] || '',
    fit: r['핏'] || r['VISION_FIT'] || '',
    neck: r['넥 형태'] || r['VISION_NECKLINE'] || '',
    closure: r['잠금방식'] || r['VISION_CLOSURE'] || '',
    waistH: r['허리높이'] || r['VISION_WAIST_HEIGHT'] || '',
    waistT: r['허리타입'] || r['VISION_WAIST_TYPE'] || '',
    silhouette: r['실루엣'] || r['VISION_SILHOUETTE'] || '',
    pleats: r['주름'] || r['VISION_PLEATS'] || '',
    sleeve: r['소매'] || r['VISION_SLEEVE'] || '',
  };
}

// ── Sergio 로더 (영문 컬럼, edited 파일 우선) ────────────────────────────────

function loadSergio(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows
    .filter(r => r['PRODUCT_NAME'])
    .map(r => {
      const colorStr = r['COLOR_OPTIONS'] || '';
      const colors = colorStr ? String(colorStr).split(',').map(c => c.trim()).filter(Boolean) : [];
      const price = r['DISCOUNTED_PRICE'] || r['PRICE'] || '';

      return {
        brand: 'Sergio Tacchini',
        name: r['PRODUCT_NAME'],
        price: parsePrice(price),
        priceRaw: String(price),
        colors,
        colorsCnt: colors.length,
        main: '의류',
        mid: r['CATEGORY_MID'] || '',
        sub: r['CATEGORY_SUB'] || '',
        fabric: r['FABRIC'] || r['FABRIC_TYPE'] || '',
        image: r['IMAGE_URL'] || '',
        url: r['PRODUCT_URL'] || '',
        RA: toInt(r['VISION_RA']),
        SB: toInt(r['VISION_SB']),
        GU: toInt(r['VISION_GU']),
        reason: r['VISION_REASON'] || '',
        length: r['VISION_LENGTH'] || '',
        fit: r['VISION_FIT'] || '',
        neck: r['VISION_NECKLINE'] || '',
        closure: r['VISION_CLOSURE'] || '',
        waistH: r['VISION_WAIST_HEIGHT'] || '',
        waistT: r['VISION_WAIST_TYPE'] || '',
        silhouette: r['VISION_SILHOUETTE'] || '',
        pleats: r['VISION_PLEATS'] || '',
        sleeve: r['VISION_SLEEVE'] || '',
      };
    });
}

// ── JSON 로더 (Ralph Lauren, Lacoste) ────────────────────────────────────────

function loadJson(filePath, brand) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const items = Array.isArray(raw) ? raw : [];

  return items
    .filter(r => r.product_name)
    .map(r => {
      const colors = Array.isArray(r.colors)
        ? r.colors.map(c => typeof c === 'string' ? c : (c.color_name || c.name || '')).filter(Boolean)
        : typeof r.colors === 'string'
          ? r.colors.split(',').map(c => c.trim()).filter(Boolean)
          : [];

      return {
        brand,
        name: r.product_name,
        price: parsePrice(r.price),
        priceRaw: String(r.price || ''),
        colors,
        colorsCnt: colors.length,
        main: r.category_main || '의류',
        mid: r.category_mid || '',
        sub: r.category_sub || r.vision_sub || '',
        fabric: r.fabric_type || '',
        image: Array.isArray(r.images) ? (r.images[0] || '') : (r.image_url || ''),
        url: r.product_url || '',
        RA: toInt(r.vision_RA),
        SB: toInt(r.vision_SB),
        GU: toInt(r.vision_GU),
        reason: r.vision_reason || '',
        length: r.vision_length || '',
        fit: r.vision_fit || '',
        neck: r.vision_neckline || '',
        closure: r.vision_closure || '',
        waistH: r.vision_waist_height || '',
        waistT: r.vision_waist_type || '',
        silhouette: r.vision_silhouette || '',
        pleats: r.vision_pleats || '',
        sleeve: r.vision_sleeve || '',
      };
    });
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function parsePrice(v) {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function toInt(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

// ── 번들 데이터 로드 (Render 배포용) ─────────────────────────────────────────

function loadBundled() {
  const bundlePath = path.join(__dirname, 'data', 'competitors.json');
  if (!fs.existsSync(bundlePath)) return false;

  const raw = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
  products = raw;
  loadedAt = new Date().toISOString();
  console.log(`  [번들] ${bundlePath} → ${products.length}개 상품`);
  return true;
}

// ── 전체 로드 (로컬 크롤러 우선, 없으면 번들 폴백) ──────────────────────────

function loadAll() {
  products = [];
  const errors = [];

  // 로컬 크롤러 경로가 없으면 번들 데이터 사용
  if (!fs.existsSync(CRAWLER_ROOT)) {
    console.log(`  [로컬 크롤러 없음] 번들 데이터 로드 시도...`);
    if (loadBundled()) {
      return { total: products.length, errors: [] };
    }
    return { total: 0, errors: ['크롤러 폴더 및 번들 데이터 모두 없음'] };
  }

  // Alo Yoga
  const aloFile = latestFile(
    path.join(CRAWLER_ROOT, 'alo_crawler'),
    /alo_yoga.*_vision\.xlsx$/i
  );
  if (aloFile) {
    try {
      products.push(...loadExcel(aloFile, 'Alo Yoga'));
      console.log(`  [Alo Yoga] ${aloFile} → ${products.filter(p => p.brand === 'Alo Yoga').length}개`);
    } catch (e) { errors.push(`Alo: ${e.message}`); }
  } else { errors.push('Alo: 파일 없음'); }

  // Wilson
  const wilFile = latestFile(
    path.join(CRAWLER_ROOT, 'wilson_crawler'),
    /wilson.*_vision\.xlsx$/i
  );
  if (wilFile) {
    try {
      products.push(...loadExcel(wilFile, 'Wilson'));
      console.log(`  [Wilson] ${wilFile} → ${products.filter(p => p.brand === 'Wilson').length}개`);
    } catch (e) { errors.push(`Wilson: ${e.message}`); }
  } else { errors.push('Wilson: 파일 없음'); }

  // Sergio Tacchini
  const serDir = path.join(CRAWLER_ROOT, 'sergio_crawler');
  const serFile = latestFile(serDir, /_edited.*\.xlsx$/i)
    || latestFile(serDir, /sergio.*_vision\.xlsx$/i);
  if (serFile) {
    try {
      products.push(...loadSergio(serFile));
      console.log(`  [Sergio] ${serFile} → ${products.filter(p => p.brand === 'Sergio Tacchini').length}개`);
    } catch (e) { errors.push(`Sergio: ${e.message}`); }
  } else { errors.push('Sergio: 파일 없음'); }

  // Ralph Lauren
  const rlFile = latestFile(
    path.join(CRAWLER_ROOT, 'ralphlauren_crawler'),
    /rl_products_vision.*\.json$/i
  );
  if (rlFile) {
    try {
      products.push(...loadJson(rlFile, 'Ralph Lauren'));
      console.log(`  [Ralph Lauren] ${rlFile} → ${products.filter(p => p.brand === 'Ralph Lauren').length}개`);
    } catch (e) { errors.push(`Ralph Lauren: ${e.message}`); }
  } else { errors.push('Ralph Lauren: 파일 없음'); }

  // Lacoste
  const lacFile = latestFile(
    path.join(CRAWLER_ROOT, 'lacoste_crawler'),
    /lacoste.*_vision\.json$/i
  );
  if (lacFile) {
    try {
      products.push(...loadJson(lacFile, 'Lacoste'));
      console.log(`  [Lacoste] ${lacFile} → ${products.filter(p => p.brand === 'Lacoste').length}개`);
    } catch (e) { errors.push(`Lacoste: ${e.message}`); }
  } else { errors.push('Lacoste: 파일 없음'); }

  loadedAt = new Date().toISOString();
  console.log(`  [총계] ${products.length}개 상품 로드 완료 (${loadedAt})`);
  if (errors.length) console.log(`  [경고] ${errors.join(', ')}`);

  return { total: products.length, errors };
}

// ── 쿼리 함수들 ──────────────────────────────────────────────────────────────

function queryProducts(filters = {}) {
  let result = [...products];

  if (filters.brand) {
    const b = filters.brand.toLowerCase();
    result = result.filter(p => p.brand.toLowerCase().includes(b));
  }
  if (filters.category) {
    const c = filters.category.toLowerCase();
    result = result.filter(p =>
      p.main.toLowerCase().includes(c) ||
      p.mid.toLowerCase().includes(c) ||
      p.sub.toLowerCase().includes(c)
    );
  }
  if (filters.fabric) {
    const f = filters.fabric.toLowerCase();
    result = result.filter(p => p.fabric.toLowerCase().includes(f));
  }
  if (filters.priceMin) result = result.filter(p => p.price >= filters.priceMin);
  if (filters.priceMax) result = result.filter(p => p.price <= filters.priceMax);
  if (filters.keyword) {
    const k = filters.keyword.toLowerCase();
    result = result.filter(p => p.name.toLowerCase().includes(k));
  }

  // 정렬
  if (filters.sortBy === 'price_asc') result.sort((a, b) => a.price - b.price);
  else if (filters.sortBy === 'price_desc') result.sort((a, b) => b.price - a.price);
  else if (filters.sortBy === 'ra_desc') result.sort((a, b) => b.RA - a.RA);

  const limit = Math.min(filters.limit || 50, 100);
  return {
    total: result.length,
    items: result.slice(0, limit).map(p => ({
      brand: p.brand,
      name: p.name,
      price: p.price,
      priceRaw: p.priceRaw,
      colorsCnt: p.colorsCnt,
      mid: p.mid,
      sub: p.sub,
      fabric: p.fabric,
      RA: p.RA, SB: p.SB, GU: p.GU,
      length: p.length,
      fit: p.fit,
    })),
  };
}

function getBrandSummary(brandFilter) {
  const brands = brandFilter
    ? [brandFilter]
    : [...new Set(products.map(p => p.brand))];

  return brands.map(brand => {
    const items = products.filter(p =>
      brandFilter ? p.brand.toLowerCase().includes(brand.toLowerCase()) : p.brand === brand
    );
    const clothing = items.filter(p => p.main === '의류');
    const withVision = clothing.filter(p => p.RA > 0);

    // 소분류 분포
    const subDist = {};
    clothing.forEach(p => { subDist[p.sub || '미분류'] = (subDist[p.sub || '미분류'] || 0) + 1; });

    // 소재유형 분포
    const fabricDist = {};
    clothing.forEach(p => { if (p.fabric) fabricDist[p.fabric] = (fabricDist[p.fabric] || 0) + 1; });

    // 가격 통계
    const prices = clothing.map(p => p.price).filter(p => p > 0);
    const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    // Vision 평균
    const avgRA = withVision.length ? +(withVision.reduce((s, p) => s + p.RA, 0) / withVision.length).toFixed(1) : 0;
    const avgSB = withVision.length ? +(withVision.reduce((s, p) => s + p.SB, 0) / withVision.length).toFixed(1) : 0;
    const avgGU = withVision.length ? +(withVision.reduce((s, p) => s + p.GU, 0) / withVision.length).toFixed(1) : 0;

    // 색상 옵션 평균
    const avgColors = items.length
      ? +(items.reduce((s, p) => s + p.colorsCnt, 0) / items.length).toFixed(1)
      : 0;

    return {
      brand,
      totalProducts: items.length,
      clothingProducts: clothing.length,
      visionAnalyzed: withVision.length,
      price: { avg: avgPrice, min: minPrice, max: maxPrice },
      vision: { avgRA, avgSB, avgGU },
      avgColors,
      subDistribution: subDist,
      fabricDistribution: fabricDist,
    };
  });
}

function compareBrands(metric) {
  const brands = [...new Set(products.map(p => p.brand))];
  const clothing = products.filter(p => p.main === '의류');

  if (metric === 'price') {
    return brands.map(brand => {
      const items = clothing.filter(p => p.brand === brand && p.price > 0);
      const prices = items.map(p => p.price);
      return {
        brand,
        count: items.length,
        avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
        median: prices.length ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)] : 0,
      };
    });
  }

  if (metric === 'category') {
    return brands.map(brand => {
      const items = clothing.filter(p => p.brand === brand);
      const dist = {};
      items.forEach(p => { dist[p.sub || '미분류'] = (dist[p.sub || '미분류'] || 0) + 1; });
      return { brand, total: items.length, distribution: dist };
    });
  }

  if (metric === 'vision') {
    return brands.map(brand => {
      const items = clothing.filter(p => p.brand === brand && p.RA > 0);
      return {
        brand,
        count: items.length,
        avgRA: items.length ? +(items.reduce((s, p) => s + p.RA, 0) / items.length).toFixed(1) : 0,
        avgSB: items.length ? +(items.reduce((s, p) => s + p.SB, 0) / items.length).toFixed(1) : 0,
        avgGU: items.length ? +(items.reduce((s, p) => s + p.GU, 0) / items.length).toFixed(1) : 0,
      };
    });
  }

  if (metric === 'fabric') {
    return brands.map(brand => {
      const items = clothing.filter(p => p.brand === brand && p.fabric);
      const dist = {};
      items.forEach(p => { dist[p.fabric] = (dist[p.fabric] || 0) + 1; });
      return { brand, total: items.length, distribution: dist };
    });
  }

  return { error: `지원하지 않는 metric: ${metric}. price, category, vision, fabric 중 선택하세요.` };
}

function getProductCount() {
  return { total: products.length, loadedAt };
}

module.exports = {
  loadAll,
  queryProducts,
  getBrandSummary,
  compareBrands,
  getProductCount,
};
