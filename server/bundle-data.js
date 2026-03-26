// bundle-data.js — 로컬 크롤러 데이터를 server/data/ 에 JSON으로 번들링
// 사용법: node bundle-data.js
// Render 배포 전 또는 데이터 갱신 시 실행

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CRAWLER_ROOT = 'C:\\Users\\AD0903\\brand_crawler';
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function latestFile(dir, pattern) {
  const files = fs.readdirSync(dir).filter(f => pattern.test(f)).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function parsePrice(v) {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function toInt(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

// ── Excel → JSON (Alo, Wilson) ───────────────────────────────────────────────

function convertExcel(filePath, brand) {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

  return rows
    .filter(r => r['상품명'] || r['PRODUCT_NAME'])
    .map(r => {
      const colorStr = r['색상 옵션'] || r['COLOR_OPTIONS'] || '';
      const colors = colorStr ? String(colorStr).split(',').map(c => c.trim()).filter(Boolean) : [];
      return {
        brand,
        name: r['상품명'] || r['PRODUCT_NAME'] || '',
        price: parsePrice(r['가격'] || r['PRICE']),
        colors, colorsCnt: colors.length,
        main: r['대분류'] || '의류',
        mid: r['중분류'] || '',
        sub: r['소분류'] || '',
        fabric: r['소재유형'] || '',
        image: r['대표 이미지 URL'] || '',
        url: r['상품 URL'] || '',
        RA: toInt(r['RA(질감)']), SB: toInt(r['SB(형태)']), GU: toInt(r['GU(광택)']),
        reason: r['Vision 근거'] || '',
        length: r['기장'] || '', fit: r['핏'] || '', neck: r['넥 형태'] || '',
        closure: r['잠금방식'] || '', waistH: r['허리높이'] || '', waistT: r['허리타입'] || '',
        silhouette: r['실루엣'] || '', pleats: r['주름'] || '', sleeve: r['소매'] || '',
      };
    });
}

// ── Sergio Excel → JSON ─────────────────────────────────────────────────────

function convertSergio(filePath) {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

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
        colors, colorsCnt: colors.length,
        main: '의류',
        mid: r['CATEGORY_MID'] || '',
        sub: r['CATEGORY_SUB'] || '',
        fabric: r['FABRIC'] || r['FABRIC_TYPE'] || '',
        image: r['IMAGE_URL'] || '',
        url: r['PRODUCT_URL'] || '',
        RA: toInt(r['VISION_RA']), SB: toInt(r['VISION_SB']), GU: toInt(r['VISION_GU']),
        reason: r['VISION_REASON'] || '',
        length: r['VISION_LENGTH'] || '', fit: r['VISION_FIT'] || '', neck: r['VISION_NECKLINE'] || '',
        closure: r['VISION_CLOSURE'] || '', waistH: r['VISION_WAIST_HEIGHT'] || '',
        waistT: r['VISION_WAIST_TYPE'] || '', silhouette: r['VISION_SILHOUETTE'] || '',
        pleats: r['VISION_PLEATS'] || '', sleeve: r['VISION_SLEEVE'] || '',
      };
    });
}

// ── Ralph Lauren / Lacoste JSON → 통일 JSON ─────────────────────────────────

function convertJson(filePath, brand) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  return raw
    .filter(r => r.product_name)
    .map(r => {
      const colors = Array.isArray(r.colors)
        ? r.colors.map(c => typeof c === 'string' ? c : (c.color_name || c.name || '')).filter(Boolean)
        : typeof r.colors === 'string' ? r.colors.split(',').map(c => c.trim()).filter(Boolean) : [];
      return {
        brand,
        name: r.product_name,
        price: parsePrice(r.price),
        colors, colorsCnt: colors.length,
        main: r.category_main || '의류',
        mid: r.category_mid || '',
        sub: r.category_sub || r.vision_sub || '',
        fabric: r.fabric_type || '',
        image: Array.isArray(r.images) ? (r.images[0] || '') : (r.image_url || ''),
        url: r.product_url || '',
        RA: toInt(r.vision_RA), SB: toInt(r.vision_SB), GU: toInt(r.vision_GU),
        reason: r.vision_reason || '',
        length: r.vision_length || '', fit: r.vision_fit || '', neck: r.vision_neckline || '',
        closure: r.vision_closure || '', waistH: r.vision_waist_height || '',
        waistT: r.vision_waist_type || '', silhouette: r.vision_silhouette || '',
        pleats: r.vision_pleats || '', sleeve: r.vision_sleeve || '',
      };
    });
}

// ── 메인 실행 ────────────────────────────────────────────────────────────────

function main() {
  const allProducts = [];
  const results = [];

  // Alo Yoga
  const aloFile = latestFile(path.join(CRAWLER_ROOT, 'alo_crawler'), /alo_yoga.*_vision\.xlsx$/i);
  if (aloFile) {
    const items = convertExcel(aloFile, 'Alo Yoga');
    allProducts.push(...items);
    results.push(`Alo Yoga: ${items.length}개`);
  } else { results.push('Alo Yoga: 파일 없음'); }

  // Wilson
  const wilFile = latestFile(path.join(CRAWLER_ROOT, 'wilson_crawler'), /wilson.*_vision\.xlsx$/i);
  if (wilFile) {
    const items = convertExcel(wilFile, 'Wilson');
    allProducts.push(...items);
    results.push(`Wilson: ${items.length}개`);
  } else { results.push('Wilson: 파일 없음'); }

  // Sergio Tacchini
  const serDir = path.join(CRAWLER_ROOT, 'sergio_crawler');
  const serFile = latestFile(serDir, /_edited.*\.xlsx$/i) || latestFile(serDir, /sergio.*_vision\.xlsx$/i);
  if (serFile) {
    const items = convertSergio(serFile);
    allProducts.push(...items);
    results.push(`Sergio Tacchini: ${items.length}개`);
  } else { results.push('Sergio Tacchini: 파일 없음'); }

  // Ralph Lauren
  const rlFile = latestFile(path.join(CRAWLER_ROOT, 'ralphlauren_crawler'), /rl_products_vision.*\.json$/i);
  if (rlFile) {
    const items = convertJson(rlFile, 'Ralph Lauren');
    allProducts.push(...items);
    results.push(`Ralph Lauren: ${items.length}개`);
  } else { results.push('Ralph Lauren: 파일 없음'); }

  // Lacoste
  const lacFile = latestFile(path.join(CRAWLER_ROOT, 'lacoste_crawler'), /lacoste.*_vision\.json$/i);
  if (lacFile) {
    const items = convertJson(lacFile, 'Lacoste');
    allProducts.push(...items);
    results.push(`Lacoste: ${items.length}개`);
  } else { results.push('Lacoste: 파일 없음'); }

  // 저장
  const outPath = path.join(DATA_DIR, 'competitors.json');
  fs.writeFileSync(outPath, JSON.stringify(allProducts, null, 2), 'utf-8');

  console.log(`\n📦 경쟁사 데이터 번들링 완료`);
  results.forEach(r => console.log(`  - ${r}`));
  console.log(`  → ${outPath} (${allProducts.length}개 상품, ${(fs.statSync(outPath).size / 1024).toFixed(0)}KB)\n`);
}

main();
