// ── 에이전트 자율 분석 스케줄러 ──────────────────────────────────────────────
// 주기적으로 에이전트에게 분석 지시를 보내고, 결과를 저장/브로드캐스트

const fs = require('fs');
const path = require('path');

const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');

// ── 기본 템플릿 ─────────────────────────────────────────────────────────────

const DEFAULT_SCHEDULES = [
  {
    id: 'sched_1',
    name: '일일 트렌드 브리핑',
    type: 'chat',        // 'chat' | 'meeting' | 'collaboration'
    agentId: 2,           // 김하늘
    agents: null,
    instruction: '오늘의 주요 트렌드를 요약해주세요. 무신사 랭킹 변화, TikTok 인기 해시태그, 네이버 검색 트렌드 중 주목할 만한 변화를 데이터와 함께 정리해주세요.',
    intervalMinutes: 240, // 4시간
    enabled: false,
    lastRun: null,
    lastReportPreview: null,
  },
  {
    id: 'sched_2',
    name: '주간 판매 리포트',
    type: 'chat',
    agentId: 4,           // 최재원
    agents: null,
    instruction: '최근 2주간 채널별 판매 실적을 분석하고, 전주 대비 변화가 큰 카테고리를 중심으로 핵심 수치와 함께 요약해주세요.',
    intervalMinutes: 1440, // 24시간
    enabled: false,
    lastRun: null,
    lastReportPreview: null,
  },
  {
    id: 'sched_3',
    name: '경쟁사 동향 체크',
    type: 'chat',
    agentId: 1,           // 이서연
    agents: null,
    instruction: '경쟁사 5개 브랜드의 상품 동향을 분석하고, 주목할만한 가격대/카테고리 변화와 우리 브랜드에 대한 시사점을 요약해주세요.',
    intervalMinutes: 1440,
    enabled: false,
    lastRun: null,
    lastReportPreview: null,
  },
  {
    id: 'sched_4',
    name: '상품 기획 인사이트',
    type: 'chat',
    agentId: 3,           // 박도현
    agents: null,
    instruction: '최근 카테고리별 판매 성과와 재고 현황을 분석하고, 다음 시즌 기획 방향에 대한 인사이트를 데이터 기반으로 제안해주세요.',
    intervalMinutes: 2880, // 48시간
    enabled: false,
    lastRun: null,
    lastReportPreview: null,
  },
  {
    id: 'sched_5',
    name: '전략 종합 회의',
    type: 'meeting',
    agentId: null,
    agents: null,
    instruction: '이번 주 주요 데이터를 바탕으로 전략 방향을 점검하고, 다음 주 우선과제를 정리해주세요. 각자 데이터를 조회하여 근거를 제시해주세요.',
    intervalMinutes: 10080, // 1주
    enabled: false,
    lastRun: null,
    lastReportPreview: null,
  },
];

// ── 스케줄 관리 ─────────────────────────────────────────────────────────────

let schedules = [];
let scheduleTimers = {}; // id → setInterval handle
let idCounter = 10;
let executeCallback = null; // 서버에서 주입하는 실행 콜백

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf-8'));
      schedules = data;
      // ID 카운터 동기화
      for (const s of schedules) {
        const num = parseInt(s.id.replace('sched_', ''));
        if (num >= idCounter) idCounter = num + 1;
      }
      console.log(`[Scheduler] ${schedules.length}개 스케줄 로드 완료`);
    } else {
      schedules = JSON.parse(JSON.stringify(DEFAULT_SCHEDULES));
      saveSchedules();
      console.log(`[Scheduler] 기본 템플릿 ${schedules.length}개 생성`);
    }
  } catch (err) {
    console.error(`[Scheduler] 로드 실패: ${err.message}`);
    schedules = JSON.parse(JSON.stringify(DEFAULT_SCHEDULES));
  }
}

function saveSchedules() {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Scheduler] 저장 실패: ${err.message}`);
  }
}

function getSchedules() {
  return schedules.map(s => ({
    ...s,
    nextRun: s.enabled && s.lastRun
      ? new Date(new Date(s.lastRun).getTime() + s.intervalMinutes * 60000).toISOString()
      : null,
  }));
}

function getSchedule(id) {
  return schedules.find(s => s.id === id);
}

function createSchedule({ name, type, agentId, agents, instruction, intervalMinutes }) {
  const schedule = {
    id: `sched_${++idCounter}`,
    name: name || '새 스케줄',
    type: type || 'chat',
    agentId: type === 'meeting' ? null : (agentId ?? 0),
    agents: type === 'collaboration' ? (agents || []) : null,
    instruction: instruction || '',
    intervalMinutes: intervalMinutes || 60,
    enabled: false,
    lastRun: null,
    lastReportPreview: null,
  };
  schedules.push(schedule);
  saveSchedules();
  return schedule;
}

function updateSchedule(id, updates) {
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return null;

  if (updates.name !== undefined) schedule.name = updates.name;
  if (updates.instruction !== undefined) schedule.instruction = updates.instruction;
  if (updates.intervalMinutes !== undefined) schedule.intervalMinutes = updates.intervalMinutes;
  if (updates.agentId !== undefined) schedule.agentId = updates.agentId;
  if (updates.agents !== undefined) schedule.agents = updates.agents;
  if (updates.type !== undefined) schedule.type = updates.type;

  saveSchedules();
  return schedule;
}

function toggleSchedule(id, enabled) {
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return null;

  schedule.enabled = enabled;
  saveSchedules();

  if (enabled) {
    startTimer(schedule);
  } else {
    stopTimer(id);
  }

  return schedule;
}

function deleteSchedule(id) {
  stopTimer(id);
  const idx = schedules.findIndex(s => s.id === id);
  if (idx >= 0) {
    schedules.splice(idx, 1);
    saveSchedules();
    return true;
  }
  return false;
}

// ── 타이머 관리 ─────────────────────────────────────────────────────────────

function setExecuteCallback(cb) {
  executeCallback = cb;
}

function startTimer(schedule) {
  stopTimer(schedule.id); // 기존 타이머 제거

  if (!schedule.enabled || !executeCallback) return;

  const intervalMs = schedule.intervalMinutes * 60 * 1000;
  console.log(`[Scheduler] ⏰ "${schedule.name}" 타이머 시작 (${schedule.intervalMinutes}분 간격)`);

  // 첫 실행: lastRun 기준으로 남은 시간 계산
  let firstDelay = intervalMs;
  if (schedule.lastRun) {
    const elapsed = Date.now() - new Date(schedule.lastRun).getTime();
    firstDelay = Math.max(0, intervalMs - elapsed);
  }

  // 첫 실행 타이머
  const firstTimeout = setTimeout(() => {
    runSchedule(schedule);
    // 이후 반복 타이머
    scheduleTimers[schedule.id] = setInterval(() => {
      runSchedule(schedule);
    }, intervalMs);
  }, firstDelay);

  // 타이머 저장 (첫 실행용)
  scheduleTimers[schedule.id] = firstTimeout;
}

function stopTimer(id) {
  if (scheduleTimers[id]) {
    clearTimeout(scheduleTimers[id]);
    clearInterval(scheduleTimers[id]);
    delete scheduleTimers[id];
    console.log(`[Scheduler] ⏹ 타이머 중지: ${id}`);
  }
}

async function runSchedule(schedule) {
  if (!executeCallback) return;

  console.log(`[Scheduler] 🚀 자동 실행: "${schedule.name}"`);
  schedule.lastRun = new Date().toISOString();
  saveSchedules();

  try {
    const result = await executeCallback(schedule);
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    schedule.lastReportPreview = resultStr.slice(0, 200);
    saveSchedules();
    console.log(`[Scheduler] ✅ 완료: "${schedule.name}" (${result.length} chars)`);
  } catch (err) {
    console.error(`[Scheduler] ❌ 실패: "${schedule.name}" — ${err.message}`);
    schedule.lastReportPreview = `오류: ${err.message}`;
    saveSchedules();
  }
}

// ── 모든 활성 스케줄 타이머 시작 ──────────────────────────────────────────────

function startAllTimers() {
  for (const schedule of schedules) {
    if (schedule.enabled) {
      startTimer(schedule);
    }
  }
}

function stopAllTimers() {
  for (const id of Object.keys(scheduleTimers)) {
    stopTimer(id);
  }
}

// ── 리포트 저장 (최근 N개만 보관) ────────────────────────────────────────────

const REPORTS_FILE = path.join(__dirname, 'reports.json');
const MAX_REPORTS = 50;
let reports = [];

function loadReports() {
  try {
    if (fs.existsSync(REPORTS_FILE)) {
      reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
      console.log(`[Scheduler] ${reports.length}개 리포트 이력 로드`);
    }
  } catch (err) {
    reports = [];
  }
}

function saveReport(report) {
  reports.unshift(report);
  if (reports.length > MAX_REPORTS) reports.length = MAX_REPORTS;
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Scheduler] 리포트 저장 실패: ${err.message}`);
  }
}

function getReports(scheduleId, limit = 10) {
  if (scheduleId) {
    return reports.filter(r => r.scheduleId === scheduleId).slice(0, limit);
  }
  return reports.slice(0, limit);
}

module.exports = {
  loadSchedules,
  getSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  toggleSchedule,
  deleteSchedule,
  setExecuteCallback,
  startAllTimers,
  stopAllTimers,
  runSchedule,
  loadReports,
  saveReport,
  getReports,
};
