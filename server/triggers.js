// ── 에이전트 간 자동 트리거 시스템 ──────────────────────────────────────────
// 도구 실행 결과를 분석하여 조건 충족 시 후속 에이전트를 자동 호출

const fs = require('fs');
const path = require('path');

const TRIGGERS_FILE = path.join(__dirname, 'triggers.json');

// ── 기본 트리거 템플릿 ─────────────────────────────────────────────────────

const DEFAULT_TRIGGERS = [
  {
    id: 'trig_1',
    name: '급상승 트렌드 → 경쟁사 확인',
    description: '김하늘이 급상승 키워드/상품을 발견하면, 이서연이 경쟁사에서 관련 동향을 자동 확인',
    sourceAgentId: 2,       // 김하늘 (Trend)
    sourceTools: ['query_musinsa_ranking', 'get_musinsa_summary', 'get_rising_keywords', 'query_tiktok_hashtags'],
    condition: {
      type: 'rising_detected',  // 급상승 항목 감지
      threshold: 3,              // 급상승 항목 N개 이상
    },
    targetAgentId: 1,       // 이서연 (Market)
    targetInstruction: '김하늘이 다음 급상승 트렌드를 발견했습니다:\n{summary}\n\n이 트렌드와 관련된 경쟁사 동향을 확인하고, 우리 브랜드에 대한 시사점을 분석해주세요.',
    enabled: false,
    lastTriggered: null,
    triggerCount: 0,
    cooldownMinutes: 30,    // 최소 실행 간격
  },
  {
    id: 'trig_2',
    name: '경쟁사 가격 변동 → 상품 기획 알림',
    description: '이서연이 경쟁사 가격 변동을 감지하면, 박도현이 자사 상품 포지셔닝을 자동 점검',
    sourceAgentId: 1,       // 이서연 (Market)
    sourceTools: ['compare_brands', 'get_brand_summary', 'query_competitors'],
    condition: {
      type: 'price_insight',    // 가격 관련 인사이트 감지
      threshold: 0,
    },
    targetAgentId: 3,       // 박도현 (Product)
    targetInstruction: '이서연이 경쟁사 분석에서 다음 인사이트를 발견했습니다:\n{summary}\n\n��를 참고하여 우리 상품의 카테고리별 가격 포지셔닝과 기획 방향을 점검해주세요.',
    enabled: false,
    lastTriggered: null,
    triggerCount: 0,
    cooldownMinutes: 60,
  },
  {
    id: 'trig_3',
    name: '판매 실적 이상 → CEO 보고',
    description: '최재원이 판매 급감/급증을 감지하면, CEO(한준혁)에게 자동 보고',
    sourceAgentId: 4,       // 최재원 (Data)
    sourceTools: ['query_snowflake', 'get_weekly_summary'],
    condition: {
      type: 'anomaly_detected', // 이상치 감지
      threshold: 20,             // 20% 이상 변동
    },
    targetAgentId: 0,       // 한준혁 (CEO)
    targetInstruction: '최재원이 판매 데이터에서 다음 이상 징후를 감지했습니다:\n{summary}\n\n이 상황에 대한 전략적 판단과 대응 방향을 정리해주세요. 필요하면 결재요청을 올려주세요.',
    enabled: false,
    lastTriggered: null,
    triggerCount: 0,
    cooldownMinutes: 120,
  },
  {
    id: 'trig_4',
    name: '트렌드 발견 → 상품 기획 제안',
    description: '김하늘이 새로운 트렌드를 발견하면, 박도현이 상품 기획 관점에서 자동 분석',
    sourceAgentId: 2,       // 김하늘 (Trend)
    sourceTools: ['get_tiktok_summary', 'get_google_trends_summary', 'get_musinsa_summary'],
    condition: {
      type: 'new_trend',       // 새로운 트렌드 감지
      threshold: 0,
    },
    targetAgentId: 3,       // 박도현 (Product)
    targetInstruction: '김하늘이 다음 트렌드 인사이트를 정리했습니다:\n{summary}\n\n이 트렌드를 반영한 상품 기획 방향을 제안해주세요. 카테고리, SKU, 소재 관점에서 분석해주세요.',
    enabled: false,
    lastTriggered: null,
    triggerCount: 0,
    cooldownMinutes: 60,
  },
  {
    id: 'trig_5',
    name: '상품 기획 완료 → 데이터 검증',
    description: '박도현이 기획안을 제시하면, 최재원이 판매 데이터로 자동 검증',
    sourceAgentId: 3,       // 박도현 (Product)
    sourceTools: ['get_category_performance', 'get_top_selling_styles', 'query_product_db'],
    condition: {
      type: 'analysis_complete', // 분석 완료 감지
      threshold: 0,
    },
    targetAgentId: 4,       // 최재원 (Data)
    targetInstruction: '박도현이 다음 상품 기획 분석을 완료했습니다:\n{summary}\n\n이 기획의 타당성을 판매 데이터로 검증해주세요. 관련 카테고리의 최근 판매 추이와 재고 효율을 확인해주세요.',
    enabled: false,
    lastTriggered: null,
    triggerCount: 0,
    cooldownMinutes: 60,
  },
];

// ── 트리거 관리 ─────────────────────────────────────────────────────────────

let triggers = [];
let trigIdCounter = 10;
let triggerExecuteCallback = null;

function loadTriggers() {
  try {
    if (fs.existsSync(TRIGGERS_FILE)) {
      triggers = JSON.parse(fs.readFileSync(TRIGGERS_FILE, 'utf-8'));
      for (const t of triggers) {
        const num = parseInt(t.id.replace('trig_', ''));
        if (num >= trigIdCounter) trigIdCounter = num + 1;
      }
      console.log(`[Triggers] ${triggers.length}개 트리거 로드 완료`);
    } else {
      triggers = JSON.parse(JSON.stringify(DEFAULT_TRIGGERS));
      saveTriggers();
      console.log(`[Triggers] 기본 트리거 ${triggers.length}개 생성`);
    }
  } catch (err) {
    console.error(`[Triggers] 로드 실패: ${err.message}`);
    triggers = JSON.parse(JSON.stringify(DEFAULT_TRIGGERS));
  }
}

function saveTriggers() {
  try {
    fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(triggers, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Triggers] 저장 실패: ${err.message}`);
  }
}

function getTriggers() { return triggers; }
function getTrigger(id) { return triggers.find(t => t.id === id); }

function createTrigger(data) {
  const trigger = {
    id: `trig_${++trigIdCounter}`,
    name: data.name || '새 트리거',
    description: data.description || '',
    sourceAgentId: data.sourceAgentId,
    sourceTools: data.sourceTools || [],
    condition: data.condition || { type: 'analysis_complete', threshold: 0 },
    targetAgentId: data.targetAgentId,
    targetInstruction: data.targetInstruction || '{summary} 에 대해 분석해주세요.',
    enabled: false,
    lastTriggered: null,
    triggerCount: 0,
    cooldownMinutes: data.cooldownMinutes || 30,
  };
  triggers.push(trigger);
  saveTriggers();
  return trigger;
}

function toggleTrigger(id, enabled) {
  const trigger = triggers.find(t => t.id === id);
  if (!trigger) return null;
  trigger.enabled = enabled;
  saveTriggers();
  return trigger;
}

function deleteTrigger(id) {
  const idx = triggers.findIndex(t => t.id === id);
  if (idx >= 0) { triggers.splice(idx, 1); saveTriggers(); return true; }
  return false;
}

function setTriggerExecuteCallback(cb) {
  triggerExecuteCallback = cb;
}

// ── 조건 평가 ─────────────────────────────────────────────────────────────

function evaluateCondition(trigger, toolName, rawResult) {
  try {
    const data = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
    const cond = trigger.condition;

    switch (cond.type) {
      case 'rising_detected':
        return checkRisingDetected(data, toolName, cond.threshold);
      case 'price_insight':
        return checkPriceInsight(data, toolName);
      case 'anomaly_detected':
        return checkAnomalyDetected(data, toolName, cond.threshold);
      case 'new_trend':
        return checkNewTrend(data, toolName);
      case 'analysis_complete':
        return checkAnalysisComplete(data, toolName);
      default:
        return { triggered: false };
    }
  } catch (err) {
    return { triggered: false };
  }
}

function checkRisingDetected(data, toolName, threshold) {
  // 무신사 — isRising 항목
  if (data.items && Array.isArray(data.items)) {
    const rising = data.items.filter(i => i.isRising || i.diffType === 'rising' || i.diffType === 'new');
    if (rising.length >= threshold) {
      const names = rising.slice(0, 5).map(i => i.brand ? `${i.brand} ${i.name || ''}` : (i.hashtag || i.keyword || '')).join(', ');
      return { triggered: true, summary: `급상승 ${rising.length}건 감지: ${names}` };
    }
  }
  // 급상승 키워드
  if (Array.isArray(data) && data[0]?.CHANGE_PCT) {
    const rising = data.filter(d => d.CHANGE_PCT > 50);
    if (rising.length >= threshold) {
      const names = rising.slice(0, 5).map(d => `${d.KWD}(+${d.CHANGE_PCT}%)`).join(', ');
      return { triggered: true, summary: `급상승 키워드 ${rising.length}건: ${names}` };
    }
  }
  return { triggered: false };
}

function checkPriceInsight(data, toolName) {
  // 브랜드 비교 결과가 있으면 트리거
  if (data.priceStats || (Array.isArray(data) && data[0]?.avgPrice)) {
    let summary = '';
    if (data.brand && data.priceStats) {
      summary = `${data.brand}: 평균가 ${Math.round(data.priceStats.avg)}원 (${data.totalProducts}개 상품)`;
    } else if (data.items) {
      summary = `경쟁사 상품 ${data.total || data.items.length}건 조회 완료`;
    }
    return { triggered: !!summary, summary };
  }
  return { triggered: false };
}

function checkAnomalyDetected(data, toolName, threshold) {
  // 주간 요약에서 급변 감지
  if (Array.isArray(data) && data.length >= 2 && data[0].TOTAL !== undefined) {
    const latest = data[0].TOTAL;
    const prev = data[1].TOTAL;
    if (prev > 0) {
      const changePct = ((latest - prev) / prev * 100).toFixed(1);
      if (Math.abs(changePct) >= threshold) {
        return { triggered: true, summary: `주간 판매 ${changePct > 0 ? '+' : ''}${changePct}% 변동 (${prev.toLocaleString()} → ${latest.toLocaleString()})` };
      }
    }
  }
  return { triggered: false };
}

function checkNewTrend(data, toolName) {
  // 요약 데이터에서 주요 인사이트 추출
  if (data.topBrands || data.topByViews || data.topByVolume || data.categoryDistribution) {
    let summary = '';
    if (data.topByViews) {
      summary = `TikTok 인기: ${data.topByViews.slice(0, 3).map(i => '#' + i.hashtag).join(', ')}`;
    } else if (data.topByVolume) {
      summary = `Google 인기: ${data.topByVolume.slice(0, 3).map(i => i.keyword).join(', ')}`;
    } else if (data.categoryDistribution) {
      const top = Object.entries(data.categoryDistribution).sort((a, b) => b[1] - a[1]).slice(0, 3);
      summary = `무신사 카테고리 Top: ${top.map(c => `${c[0]}(${c[1]})`).join(', ')}`;
    }
    return { triggered: !!summary, summary };
  }
  return { triggered: false };
}

function checkAnalysisComplete(data, toolName) {
  // 도구 실행이 성공적으로 완료되면 트리거
  if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
    let summary = '';
    if (Array.isArray(data)) {
      summary = `${data.length}건 데이터 분석 완료`;
    } else if (data.total !== undefined) {
      summary = `${data.total}건 데이터 분석 완료`;
    } else {
      summary = '분석 완료';
    }
    return { triggered: true, summary };
  }
  return { triggered: false };
}

// ── 트리거 실행 체크 ──────────────────────────────────────────────────────

async function checkTriggers(sourceAgentId, toolName, rawResult) {
  const matchingTriggers = triggers.filter(t =>
    t.enabled &&
    t.sourceAgentId === sourceAgentId &&
    t.sourceTools.includes(toolName)
  );

  for (const trigger of matchingTriggers) {
    // 쿨다운 체크
    if (trigger.lastTriggered) {
      const elapsed = Date.now() - new Date(trigger.lastTriggered).getTime();
      if (elapsed < trigger.cooldownMinutes * 60 * 1000) {
        continue; // 쿨다운 중
      }
    }

    const result = evaluateCondition(trigger, toolName, rawResult);
    if (result.triggered && triggerExecuteCallback) {
      console.log(`[Trigger] 🔔 "${trigger.name}" 발동! — ${result.summary}`);

      trigger.lastTriggered = new Date().toISOString();
      trigger.triggerCount++;
      saveTriggers();

      // 후속 에이전트 실행 (비동기)
      const instruction = trigger.targetInstruction.replace('{summary}', result.summary);
      try {
        await triggerExecuteCallback(trigger, instruction, result.summary);
      } catch (err) {
        console.error(`[Trigger] 실행 오류: ${err.message}`);
      }
    }
  }
}

module.exports = {
  loadTriggers,
  getTriggers,
  getTrigger,
  createTrigger,
  toggleTrigger,
  deleteTrigger,
  setTriggerExecuteCallback,
  checkTriggers,
};
