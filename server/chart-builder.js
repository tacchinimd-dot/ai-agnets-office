// ── 차트 데이터 빌더 ──────────────────────────────────────────────────────
// tool_use 결과를 Chart.js 호환 차트 데이터로 변환

const CHART_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff',
  '#ff9f43', '#79c0ff', '#7ee787', '#e3b341', '#ffa198',
  '#d2a8ff', '#ffc658',
];

function buildCharts(toolName, rawResult) {
  try {
    const data = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
    const charts = [];

    // ── 무신사 랭킹 ────────────────────────────────
    if (toolName === 'query_musinsa_ranking' && data.items) {
      const items = data.items.slice(0, 15);
      if (items.length > 0) {
        // 1. 가격 바 차트
        charts.push({
          chartType: 'bar',
          title: '무신사 랭킹 — 가격 비교',
          labels: items.map(i => `${i.rank}위 ${(i.brand||'').slice(0,6)}`),
          datasets: [{
            label: '판매가',
            data: items.map(i => i.price || 0),
            backgroundColor: items.map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length] + '99'),
            borderColor: items.map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length]),
            borderWidth: 1,
          }],
        });
        // 2. 전환율 산점도 (views vs conversion)
        if (items[0].conversion !== undefined) {
          charts.push({
            chartType: 'scatter',
            title: '무신사 — 조회수 vs 전환율',
            datasets: items.filter(i => i.views && i.conversion).slice(0, 20).map((item, idx) => ({
              label: `${item.rank}위 ${(item.brand||'').slice(0,8)}`,
              data: [{ x: item.views, y: item.conversion }],
              backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
              pointRadius: 6,
            })),
            options: { xLabel: '조회수', yLabel: '전환율(%)' },
          });
        }
      }
    }

    // ── 무신사 요약 ────────────────────────────────
    if (toolName === 'get_musinsa_summary') {
      if (data.categoryDistribution) {
        const cats = Object.entries(data.categoryDistribution).sort((a, b) => b[1] - a[1]);
        charts.push({
          chartType: 'doughnut',
          title: '무신사 카테고리 분포',
          labels: cats.map(c => c[0]),
          datasets: [{
            data: cats.map(c => c[1]),
            backgroundColor: cats.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          }],
        });
      }
      if (data.topBrands) {
        const brands = data.topBrands.slice(0, 10);
        charts.push({
          chartType: 'bar',
          title: '무신사 Top 10 브랜드',
          labels: brands.map(b => b.name),
          datasets: [{
            label: '상품 수',
            data: brands.map(b => b.count),
            backgroundColor: brands.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
            borderColor: brands.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
            borderWidth: 1,
          }],
        });
      }
    }

    // ── 카테고리 트렌드 ────────────────────────────
    if (toolName === 'get_category_trend' && data.items) {
      const items = data.items.slice(0, 10);
      charts.push({
        chartType: 'bar',
        title: `${data.category || ''} 카테고리 Top 10`,
        labels: items.map(i => `${i.rank}위 ${(i.brand||'').slice(0,6)}`),
        datasets: [
          { label: '판매가', data: items.map(i => i.price || 0), backgroundColor: '#58a6ff99', borderColor: '#58a6ff', borderWidth: 1 },
          { label: '할인율(%)', data: items.map(i => i.discount || 0), backgroundColor: '#f8514999', borderColor: '#f85149', borderWidth: 1 },
        ],
      });
    }

    // ── TikTok 해시태그 ────────────────────────────
    if (toolName === 'query_tiktok_hashtags' && data.items) {
      const items = data.items.slice(0, 15);
      charts.push({
        chartType: 'bar',
        title: 'TikTok 인기 해시태그 — 조회수',
        labels: items.map(i => `#${(i.hashtag||'').slice(0,12)}`),
        datasets: [{
          label: '조회수',
          data: items.map(i => i.views || 0),
          backgroundColor: items.map(i => {
            if (i.diffType === 'rising') return '#3fb95099';
            if (i.diffType === 'new') return '#58a6ff99';
            if (i.diffType === 'falling') return '#f8514999';
            return '#8b949e99';
          }),
          borderWidth: 1,
        }],
      });
    }

    if (toolName === 'get_tiktok_summary') {
      if (data.newEntries !== undefined) {
        charts.push({
          chartType: 'doughnut',
          title: 'TikTok 순위 변동 분포',
          labels: ['신규', '상승', '하락', '유지'],
          datasets: [{
            data: [
              data.newEntries || 0,
              data.risingCount || 0,
              data.fallingCount || 0,
              (data.total || 0) - (data.newEntries || 0) - (data.risingCount || 0) - (data.fallingCount || 0),
            ],
            backgroundColor: ['#58a6ff', '#3fb950', '#f85149', '#8b949e'],
          }],
        });
      }
      if (data.topByViews) {
        charts.push({
          chartType: 'bar',
          title: 'TikTok Top 10 — 조회수',
          labels: data.topByViews.slice(0, 10).map(i => `#${(i.hashtag||'').slice(0,12)}`),
          datasets: [{
            label: '조회수',
            data: data.topByViews.slice(0, 10).map(i => i.views || 0),
            backgroundColor: '#bc8cff99', borderColor: '#bc8cff', borderWidth: 1,
          }],
        });
      }
    }

    // ── 구글 트렌드 ────────────────────────────────
    if (toolName === 'query_google_trends' && data.items) {
      const items = data.items.slice(0, 15);
      charts.push({
        chartType: 'bar',
        title: 'Google 인기 검색어 Top 15',
        labels: items.map(i => (i.keyword || '').slice(0, 12)),
        datasets: [{
          label: '순위',
          data: items.map(i => i.rank || 0),
          backgroundColor: '#4285f499', borderColor: '#4285f4', borderWidth: 1,
        }],
        options: { reverseY: true },
      });
    }

    if (toolName === 'get_google_trends_summary' && data.topByVolume) {
      charts.push({
        chartType: 'bar',
        title: 'Google Trends — 검색량 Top 10',
        labels: data.topByVolume.slice(0, 10).map(i => (i.keyword || '').slice(0, 12)),
        datasets: [{
          label: '검색량',
          data: data.topByVolume.slice(0, 10).map(i => parseVolumeStr(i.volume)),
          backgroundColor: '#3fb95099', borderColor: '#3fb950', borderWidth: 1,
        }],
      });
    }

    // ── 경쟁사 분석 ────────────────────────────────
    if (toolName === 'get_brand_summary' && data.totalProducts) {
      const charts2 = [];
      // 가격 통계
      if (data.priceStats) {
        charts2.push({
          chartType: 'bar',
          title: `${data.brand || ''} 가격 통계`,
          labels: ['최소', '평균', '최대'],
          datasets: [{
            label: '가격(원)',
            data: [data.priceStats.min, Math.round(data.priceStats.avg), data.priceStats.max],
            backgroundColor: ['#3fb95099', '#58a6ff99', '#f8514999'],
            borderWidth: 1,
          }],
        });
      }
      // 카테고리 분포
      if (data.subcategoryDist) {
        const cats = Object.entries(data.subcategoryDist).sort((a, b) => b[1] - a[1]).slice(0, 8);
        charts2.push({
          chartType: 'doughnut',
          title: `${data.brand || ''} 카테고리 분포`,
          labels: cats.map(c => c[0]),
          datasets: [{
            data: cats.map(c => c[1]),
            backgroundColor: cats.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          }],
        });
      }
      // Vision AI 감성 레이더
      if (data.visionAvg && (data.visionAvg.RA || data.visionAvg.SB || data.visionAvg.GU)) {
        charts2.push({
          chartType: 'radar',
          title: `${data.brand || ''} Vision AI 감성`,
          labels: ['Rugged/Athletic', 'Soft/Basic', 'Glamour/Unique'],
          datasets: [{
            label: data.brand || '',
            data: [data.visionAvg.RA || 0, data.visionAvg.SB || 0, data.visionAvg.GU || 0],
            backgroundColor: '#58a6ff33', borderColor: '#58a6ff', borderWidth: 2,
            pointBackgroundColor: '#58a6ff',
          }],
        });
      }
      return charts2;
    }

    if (toolName === 'compare_brands') {
      // 비교 데이터: 여러 브랜드의 지표
      if (Array.isArray(data) && data.length > 0 && data[0].brand) {
        charts.push({
          chartType: 'bar',
          title: '브랜드 비교',
          labels: data.map(d => d.brand),
          datasets: [{
            label: data[0].avgPrice ? '평균가격' : '상품수',
            data: data.map(d => d.avgPrice || d.totalProducts || d.count || 0),
            backgroundColor: data.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
            borderColor: data.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
            borderWidth: 1,
          }],
        });
      }
    }

    if (toolName === 'query_competitors' && data.items) {
      const items = data.items.slice(0, 20);
      // 브랜드별 가격 분포
      const brandPrices = {};
      items.forEach(i => {
        if (!brandPrices[i.brand]) brandPrices[i.brand] = [];
        brandPrices[i.brand].push(i.price || 0);
      });
      const brands = Object.keys(brandPrices);
      if (brands.length >= 2) {
        charts.push({
          chartType: 'bar',
          title: '경쟁사 평균 가격 비교',
          labels: brands,
          datasets: [{
            label: '평균가격',
            data: brands.map(b => Math.round(brandPrices[b].reduce((s, v) => s + v, 0) / brandPrices[b].length)),
            backgroundColor: brands.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
            borderColor: brands.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
            borderWidth: 1,
          }],
        });
      }
    }

    // ── Snowflake 쿼리 결과 (범용) ────────────────
    if ((toolName === 'query_channel_sales' || toolName === 'query_product_info' || toolName === 'query_product_cost' || toolName === 'query_naver_keywords' || toolName === 'get_product_stock_info')) {
      const rows = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : null);
      if (rows && rows.length > 0) {
        const chart = buildGenericChart(rows, toolName);
        if (chart) charts.push(chart);
      }
    }

    // ── 주간 판매 요약 ────────────────────────────
    if (toolName === 'get_weekly_summary') {
      const rows = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : null);
      if (rows && rows.length > 0) {
        // KG API 결과: 채널별 컬럼이 있으면 기존 방식, 없으면 범용 차트
        const channels = ['CNS', 'WSL', 'DOME', 'CHN', 'GVL', 'HMD', 'TV'].filter(ch => rows[0][ch] !== undefined);
        if (channels.length > 0) {
          charts.push({
            chartType: rows.length > 3 ? 'line' : 'bar',
            title: '채널별 주간 판매',
            labels: rows.map(d => d.START_DT || d.END_DT || ''),
            datasets: channels.map((ch, i) => ({
              label: ch,
              data: rows.map(d => d[ch] || 0),
              borderColor: CHART_COLORS[i % CHART_COLORS.length],
              backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + (rows.length > 3 ? '33' : '99'),
              borderWidth: 2,
              fill: rows.length > 3,
              tension: 0.3,
            })),
          });
        } else {
          // KG API 범용 차트
          const chart = buildGenericChart(rows, toolName);
          if (chart) charts.push(chart);
        }
      }
    }

    // ── 카테고리 성과 ────────────────────────────
    if (toolName === 'get_category_performance' && Array.isArray(data) && data.length > 0) {
      // 카테고리별 그룹
      const catMap = {};
      data.forEach(d => {
        const cat = d.CAT_NM || d.SUB_CAT_NM || '기타';
        if (!catMap[cat]) catMap[cat] = { saleAmt: 0, saleQty: 0, stock: 0 };
        catMap[cat].saleAmt += (d.SALE_AMT || 0);
        catMap[cat].saleQty += (d.SALE_QTY || 0);
        catMap[cat].stock += (d.STOCK_QTY || 0);
      });
      const cats = Object.entries(catMap).sort((a, b) => b[1].saleAmt - a[1].saleAmt).slice(0, 10);
      charts.push({
        chartType: 'bar',
        title: '카테고리별 판매금액',
        labels: cats.map(c => c[0]),
        datasets: [
          { label: '판매금액', data: cats.map(c => c[1].saleAmt), backgroundColor: '#58a6ff99', borderColor: '#58a6ff', borderWidth: 1 },
          { label: '재고수량', data: cats.map(c => c[1].stock), backgroundColor: '#d2992299', borderColor: '#d29922', borderWidth: 1 },
        ],
      });
    }

    // ── 판매 TOP 스타일 ──────────────────────────
    if (toolName === 'get_top_selling_styles' && Array.isArray(data) && data.length > 0) {
      const items = data.slice(0, 15);
      charts.push({
        chartType: 'bar',
        title: '판매 TOP 스타일',
        labels: items.map(d => (d.PRDT_NM || d.STYLE_CD || '').slice(0, 12)),
        datasets: [{
          label: '판매금액',
          data: items.map(d => d.CUR_SALE_AMT || 0),
          backgroundColor: items.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
          borderColor: items.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderWidth: 1,
        }],
      });
    }

    // ── 급상승 키워드 ────────────────────────────
    if (toolName === 'get_rising_keywords' && Array.isArray(data) && data.length > 0) {
      const items = data.slice(0, 15);
      if (items[0].KWD) {
        charts.push({
          chartType: 'bar',
          title: '급상승/급하락 키워드',
          labels: items.map(d => (d.KWD || '').slice(0, 10)),
          datasets: [{
            label: '변화율(%)',
            data: items.map(d => d.CHANGE_PCT || 0),
            backgroundColor: items.map(d => (d.CHANGE_PCT || 0) >= 0 ? '#3fb95099' : '#f8514999'),
            borderWidth: 1,
          }],
        });
      }
    }

    return charts;
  } catch (err) {
    console.error(`[ChartBuilder] ${toolName} 파싱 오류: ${err.message}`);
    return [];
  }
}

// ── 범용 Snowflake 결과 차트 생성 ────────────────────────────────────────────

function buildGenericChart(data, toolName) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const keys = Object.keys(data[0]);
  // 숫자 컬럼과 문자 컬럼 분류
  const numCols = keys.filter(k => typeof data[0][k] === 'number' && !k.includes('_CD') && k !== 'RNK');
  const strCols = keys.filter(k => typeof data[0][k] === 'string');
  const dateCols = strCols.filter(k => k.includes('DT') || k.includes('DATE') || k.includes('WEEK'));
  const labelCols = strCols.filter(k => !dateCols.includes(k));

  if (numCols.length === 0) return null;

  // 시계열 데이터 (날짜 컬럼 + 숫자 컬럼)
  if (dateCols.length > 0 && data.length >= 3) {
    const xCol = dateCols[0];
    const yCols = numCols.slice(0, 4); // 최대 4개 시리즈
    return {
      chartType: 'line',
      title: toolName === 'query_naver_keywords' ? '네이버 키워드 검색량 추이' : '시계열 데이터',
      labels: data.map(d => String(d[xCol] || '')),
      datasets: yCols.map((col, i) => ({
        label: col,
        data: data.map(d => d[col] || 0),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '33',
        borderWidth: 2,
        tension: 0.3,
        fill: yCols.length === 1,
      })),
    };
  }

  // 카테고리형 데이터 (라벨 컬럼 + 숫자 컬럼)
  if (labelCols.length > 0) {
    const xCol = labelCols[0];
    const yCol = numCols[0];
    const items = data.slice(0, 15);
    return {
      chartType: 'bar',
      title: `${xCol} 별 ${yCol}`,
      labels: items.map(d => String(d[xCol] || '').slice(0, 15)),
      datasets: [{
        label: yCol,
        data: items.map(d => d[yCol] || 0),
        backgroundColor: items.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
        borderColor: items.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderWidth: 1,
      }],
    };
  }

  return null;
}

function parseVolumeStr(vol) {
  if (typeof vol === 'number') return isNaN(vol) ? 0 : vol;
  if (!vol) return 0;
  const s = String(vol);
  if (s.includes('만')) { const n = parseFloat(s); return isNaN(n) ? 0 : n * 10000; }
  if (s.includes('천')) { const n = parseFloat(s); return isNaN(n) ? 0 : n * 1000; }
  return parseInt(s.replace(/[^0-9]/g, '')) || 0;
}

module.exports = { buildCharts };
