require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { AGENTS, getAgent, getConversation, addMessage, clearConversation, clearAllConversations } = require('./agents');
const { DATA_ANALYST_TOOLS } = require('./tools');
const { getChannelSales, getDateDataset, testConnection: testKgConnection, getProductProperties, getProductCost, getSeasonWearPerformance, getStyleRanking, getSimilarProducts, getProductStock, getNaverSearchKeyword } = require('./kg-api');
const { MARKET_AGENT_TOOLS } = require('./market-tools');
const { PRODUCT_PLANNING_TOOLS } = require('./product-tools');
const { TREND_AGENT_TOOLS, loadMusinsaData, loadTiktokData, loadGoogleTrends, queryRanking, getRankingSummary, getCategoryTrend, queryTiktokHashtags, getTiktokSummary, queryGoogleTrends, getGoogleTrendsSummary, runMusinsaCrawler, runTiktokCrawler } = require('./trend-tools');
// snowflake.js는 더 이상 에이전트에서 사용하지 않음 (전원 KG API 전환)
const { loadAll, queryProducts, getBrandSummary, compareBrands, getProductCount } = require('./competitors');
const scheduler = require('./scheduler');
const { buildCharts } = require('./chart-builder');
const triggers = require('./triggers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// 프론트엔드 HTML 서빙 (상위 폴더)
app.use(express.static(path.join(__dirname, '..')));

// Claude API 클라이언트
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── REST API ────────────────────────────────────────────────────────────────

// 에이전트 목록
app.get('/api/agents', (req, res) => {
  res.json(AGENTS.map(({ id, name, role, color }) => ({ id, name, role, color })));
});

// 대화 초기화
app.post('/api/clear/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  if (id === -1) {
    clearAllConversations();
    res.json({ ok: true, message: '전체 대화 초기화 완료' });
  } else {
    clearConversation(id);
    res.json({ ok: true, message: `${getAgent(id)?.name || id} 대화 초기화 완료` });
  }
});

// ── WebSocket ───────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('[WS] 클라이언트 연결됨');

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '잘못된 메시지 형식' }));
      return;
    }

    const { type, agentId, content } = msg;

    if (type === 'chat') {
      await handleChat(ws, agentId, content);
    } else if (type === 'meeting') {
      await handleMeeting(ws, content);
    } else if (type === 'approval_response') {
      handleApprovalResponse(ws, msg);
    } else if (type === 'schedule_list') {
      ws.send(JSON.stringify({ type: 'schedule_list', schedules: scheduler.getSchedules(), reports: scheduler.getReports(null, 20) }));
    } else if (type === 'schedule_create') {
      const schedule = scheduler.createSchedule(msg.schedule);
      broadcast({ type: 'schedule_updated', schedule });
    } else if (type === 'schedule_toggle') {
      const schedule = scheduler.toggleSchedule(msg.scheduleId, msg.enabled);
      if (schedule) broadcast({ type: 'schedule_updated', schedule });
    } else if (type === 'schedule_delete') {
      if (scheduler.deleteSchedule(msg.scheduleId)) {
        broadcast({ type: 'schedule_deleted', scheduleId: msg.scheduleId });
      }
    } else if (type === 'schedule_update') {
      const schedule = scheduler.updateSchedule(msg.scheduleId, msg.updates);
      if (schedule) broadcast({ type: 'schedule_updated', schedule });
    } else if (type === 'schedule_run_now') {
      const schedule = scheduler.getSchedule(msg.scheduleId);
      if (schedule) {
        executeScheduledTask(schedule);
      }
    } else if (type === 'trigger_list') {
      ws.send(JSON.stringify({ type: 'trigger_list', triggers: triggers.getTriggers() }));
    } else if (type === 'trigger_toggle') {
      const trigger = triggers.toggleTrigger(msg.triggerId, msg.enabled);
      if (trigger) broadcast({ type: 'trigger_updated', trigger });
    } else if (type === 'trigger_delete') {
      if (triggers.deleteTrigger(msg.triggerId)) {
        broadcast({ type: 'trigger_deleted', triggerId: msg.triggerId });
      }
    } else if (type === 'trigger_create') {
      const trigger = triggers.createTrigger(msg.trigger);
      broadcast({ type: 'trigger_updated', trigger });
    }
  });

  ws.on('close', () => console.log('[WS] 클라이언트 연결 해제'));
});

// ── Tool 실행 핸들러 ─────────────────────────────────────────────────────────

// ── consult_agent 도구 정의 빌더 ─────────────────────────────────────────────

function buildConsultTool(callingAgentId) {
  const agentList = [
    { id: 0, name: '한준혁', desc: 'CEO / 전략 총괄 — 의사결정, 전략 방향' },
    { id: 1, name: '이서연', desc: 'Market Agent — 경쟁사 5개 브랜드 839개 상품 데이터' },
    { id: 2, name: '김하늘', desc: 'Trend Agent — 네이버 키워드, 무신사, TikTok, 구글 트렌드' },
    { id: 3, name: '박도현', desc: 'Product Planning — 상품 마스터, 카테고리 판매, 원가' },
    { id: 4, name: '최재원', desc: 'Data Analyst — 채널별 판매 실적 (DB_SCS_W)' },
  ].filter(a => a.id !== callingAgentId);

  return {
    name: 'consult_agent',
    description: `다른 에이전트에게 전문 의견이나 데이터를 요청합니다. 당신의 전문 분야 밖의 데이터나 관점이 필요할 때 사용하세요.\n\n상담 가능한 에이전트:\n${agentList.map(a => `- ${a.name} (id: ${a.id}) — ${a.desc}`).join('\n')}\n\n중요: 불필요한 상담은 자제하세요. 당신이 직접 답변할 수 있는 내용은 직접 답변하세요.`,
    input_schema: {
      type: 'object',
      properties: {
        target_agent_id: { type: 'number', description: '상담할 에이전트 ID (0~4)' },
        question: { type: 'string', description: '구체적인 질문 (데이터 요청 시 원하는 지표/기간/조건을 명확히)' },
        context: { type: 'string', description: '질문 배경 (현재 분석 맥락을 간략히 공유)' },
      },
      required: ['target_agent_id', 'question'],
    },
  };
}

// ── 에이전트 상담 실행 (consult_agent 핸들러) ────────────────────────────────

async function executeConsultation(sendFn, callingAgentId, targetAgentId, question, questionContext) {
  const callingAgent = getAgent(callingAgentId);
  const targetAgent = getAgent(targetAgentId);

  if (!targetAgent) return JSON.stringify({ error: `에이전트 ID ${targetAgentId}를 찾을 수 없습니다` });
  if (targetAgentId === callingAgentId) return JSON.stringify({ error: '자기 자신에게는 상담할 수 없습니다' });

  console.log(`[Consult] ${callingAgent?.name} → ${targetAgent.name}: ${question.slice(0, 80)}`);

  // 상담 시작 알림
  sendFn({
    type: 'consultation_start',
    callingAgentId,
    targetAgentId,
    callingName: callingAgent?.name || '',
    targetName: targetAgent.name,
    question,
  });

  // 임시 대화 컨텍스트 (기존 대화 오염 방지)
  const tempMessages = [{
    role: 'user',
    content: `[에이전트 상담 요청] ${callingAgent?.name}(${callingAgent?.role})이 당신에게 질문합니다:\n\n"${question}"${questionContext ? `\n\n배경: ${questionContext}` : ''}\n\n도구를 사용해 데이터를 조회하고, 핵심 수치와 함께 간결하게 답변해주세요 (3-5문장).`,
  }];

  // 상담받는 에이전트의 데이터 도구만 (consult_agent 제외 = 재귀 방지)
  const tools = getToolsForAgent(targetAgentId, false);

  let fullResponse = '';
  let loopCount = 0;
  const maxLoops = 3;

  try {
    while (loopCount < maxLoops) {
      loopCount++;

      const apiParams = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: targetAgent.systemPrompt + '\n\n[상담 모드] 동료 에이전트의 질문에 답변 중입니다. 도구를 적극 활용하여 데이터 기반으로 간결하게 답변하세요.',
        messages: tempMessages,
      };
      if (tools) apiParams.tools = tools;

      const stream = anthropic.messages.stream(apiParams);
      let turnText = '';
      let toolUseBlocks = [];

      stream.on('text', (text) => { turnText += text; });
      const finalMessage = await stream.finalMessage();

      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') toolUseBlocks.push(block);
      }

      if (toolUseBlocks.length === 0) {
        fullResponse += turnText;
        break;
      }

      // tool_use 처리
      tempMessages.push({ role: 'assistant', content: finalMessage.content });

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await executeTool(toolBlock.name, toolBlock.input);
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
          console.log(`[Consult Tool] ${targetAgent.name} → ${toolBlock.name} 성공`);
          sendFn({
            type: 'tool_activity',
            agentId: targetAgentId,
            agentName: targetAgent.name,
            toolName: toolBlock.name,
            toolLabel: TOOL_LABELS[toolBlock.name] || toolBlock.name,
            inputSummary: toolBlock.input.purpose || toolBlock.input.sql?.slice(0, 80) || JSON.stringify(toolBlock.input).slice(0, 80),
            preview: buildResultPreview(toolBlock.name, result),
            success: true,
            resultSize: result.length,
            timestamp: new Date().toISOString(),
            source: 'consultation',
          });
          logToolUse(targetAgentId, toolBlock.name, TOOL_LABELS[toolBlock.name] || toolBlock.name);
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: `오류: ${err.message}`, is_error: true });
        }
      }
      tempMessages.push({ role: 'user', content: toolResults });
      fullResponse += turnText;
    }
  } catch (err) {
    console.error(`[Consult Error] ${targetAgent.name}:`, err.message);
    fullResponse = `상담 오류: ${err.message}`;
  }

  // 로컬 로그 기록
  appendChatLog(targetAgentId, targetAgent.name, `[상담 ← ${callingAgent?.name}] ${fullResponse.slice(0, 200)}`);

  // 상담 종료 알림
  sendFn({
    type: 'consultation_end',
    callingAgentId,
    targetAgentId,
    callingName: callingAgent?.name || '',
    targetName: targetAgent.name,
    response: fullResponse,
  });

  return JSON.stringify({
    agent: targetAgent.name,
    role: targetAgent.role,
    response: fullResponse,
  });
}

// ── Tool 실행 핸들러 ─────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, context = {}) {
  // consult_agent 처리
  if (toolName === 'consult_agent') {
    const { sendFn, callingAgentId } = context;
    if (!sendFn) return JSON.stringify({ error: 'consult_agent는 이 컨텍스트에서 사용할 수 없습니다' });
    return await executeConsultation(sendFn, callingAgentId, toolInput.target_agent_id, toolInput.question, toolInput.context);
  }
  // 최재원(Data Analyst) — KG API 도구
  if (toolName === 'query_channel_sales') {
    console.log(`[Tool] query_channel_sales — ${toolInput.purpose}`);
    const result = await getChannelSales({
      selectors: toolInput.selectors || [],
      filters: toolInput.filters,
      periods: { end_dt: toolInput.end_dt },
      same_shop: toolInput.same_shop !== undefined ? toolInput.same_shop : true,
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_weekly_summary') {
    const weeks = Math.min(Math.max(1, toolInput.weeks || 4), 12);
    console.log(`[Tool] get_weekly_summary — ${weeks}주, ${toolInput.channel_type || '전체'}`);
    const filters = [{ system_code: 'ST', system_field_name: 'BRD_CD' }];
    if (toolInput.channel_type) {
      filters.push({ system_code: toolInput.channel_type, system_field_name: 'CHANNEL_TYPE' });
    }
    const endDt = new Date().toISOString().split('T')[0];
    const result = await getChannelSales({
      selectors: [{ system_field_name: 'CHANNEL_TYPE' }],
      filters,
      periods: { end_dt: endDt },
      same_shop: true,
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_date_dataset') {
    console.log('[Tool] get_date_dataset');
    const result = await getDateDataset();
    return JSON.stringify(result, null, 2);
  }

  // 김하늘(Trend Agent) 도구
  if (toolName === 'query_musinsa_ranking') {
    console.log(`[Tool] query_musinsa_ranking — filters:`, JSON.stringify(toolInput));
    const result = queryRanking(toolInput);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_musinsa_summary') {
    console.log(`[Tool] get_musinsa_summary`);
    const result = getRankingSummary();
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_category_trend') {
    console.log(`[Tool] get_category_trend — ${toolInput.category}`);
    const result = getCategoryTrend(toolInput.category);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'query_google_trends') {
    console.log(`[Tool] query_google_trends — filters:`, JSON.stringify(toolInput));
    const result = queryGoogleTrends(toolInput);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_google_trends_summary') {
    console.log(`[Tool] get_google_trends_summary`);
    const result = getGoogleTrendsSummary();
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'query_tiktok_hashtags') {
    console.log(`[Tool] query_tiktok_hashtags — filters:`, JSON.stringify(toolInput));
    const result = queryTiktokHashtags(toolInput);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_tiktok_summary') {
    console.log(`[Tool] get_tiktok_summary`);
    const result = getTiktokSummary();
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'run_tiktok_crawler') {
    if (!toolInput.confirm) {
      return JSON.stringify({ success: false, reason: 'confirm: true가 필요합니다' });
    }
    console.log(`[Tool] run_tiktok_crawler — 크롤링 시작`);
    const result = await runTiktokCrawler();
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'run_musinsa_crawler') {
    if (!toolInput.confirm) {
      return JSON.stringify({ success: false, reason: 'confirm: true가 필요합니다' });
    }
    console.log(`[Tool] run_musinsa_crawler — 크롤링 시작`);
    const result = await runMusinsaCrawler();
    return JSON.stringify(result, null, 2);
  }

  // 김하늘 — KG API 도구 (네이버 키워드)
  if (toolName === 'query_naver_keywords') {
    console.log(`[Tool] query_naver_keywords — ${toolInput.purpose}`);
    const result = await getNaverSearchKeyword({
      selectors: toolInput.selectors ? toolInput.selectors.map(s => ({ system_field_name: s.system_field_name })) : undefined,
      filters_product: toolInput.filters_product,
      filters_search_keyword: toolInput.filters_search_keyword || [],
      periods: { start_dt: toolInput.start_dt, end_dt: toolInput.end_dt },
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_rising_keywords') {
    console.log(`[Tool] get_rising_keywords — 현재:${toolInput.current_start_dt}~${toolInput.current_end_dt}, 이전:${toolInput.previous_start_dt}~${toolInput.previous_end_dt}`);
    const kwFilters = toolInput.keyword_class ? [{ system_code: toolInput.keyword_class, system_field_name: 'KWD_NM_CLASS' }] : [];
    // 현재 기간 조회
    const currentResult = await getNaverSearchKeyword({
      selectors: [{ system_field_name: 'KWD_NM' }],
      filters_product: toolInput.filters_product,
      filters_search_keyword: kwFilters,
      periods: { start_dt: toolInput.current_start_dt, end_dt: toolInput.current_end_dt },
    });
    // 이전 기간 조회
    const previousResult = await getNaverSearchKeyword({
      selectors: [{ system_field_name: 'KWD_NM' }],
      filters_product: toolInput.filters_product,
      filters_search_keyword: kwFilters,
      periods: { start_dt: toolInput.previous_start_dt, end_dt: toolInput.previous_end_dt },
    });
    return JSON.stringify({ current: currentResult, previous: previousResult, description: '두 기간의 키워드 검색량을 비교하여 급상승/급하락 키워드를 분석하세요' }, null, 2);
  }

  // 박도현(Product Planning) — KG API 도구
  if (toolName === 'query_product_info') {
    console.log(`[Tool] query_product_info — ${toolInput.purpose}`);
    const result = await getProductProperties({ filters: toolInput.filters });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'query_product_cost') {
    console.log(`[Tool] query_product_cost — ${toolInput.purpose}`);
    const result = await getProductCost({
      filters_product: toolInput.filters_product,
      filters_order: toolInput.filters_order || [],
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_category_performance') {
    console.log(`[Tool] get_category_performance — ${toolInput.current_sesn}, ${toolInput.category || '전체'}`);
    const filters = [{ system_code: 'ST', system_field_name: 'BRD_CD' }];
    if (toolInput.category) filters.push({ system_code: toolInput.category, system_field_name: 'ITEM_GROUP' });
    const result = await getSeasonWearPerformance({
      selectors: [{ system_field_name: 'BRD_CD' }, { system_field_name: 'ITEM_GROUP' }],
      filters,
      current_season_period_filters: {
        sesn: toolInput.current_sesn,
        term_start_dt: toolInput.current_term_start,
        term_end_dt: toolInput.current_term_end,
        acum_end_dt: toolInput.current_acum_end,
      },
      previous_season_period_filters: {
        sesn: toolInput.previous_sesn,
        term_start_dt: toolInput.previous_term_start,
        term_end_dt: toolInput.previous_term_end,
        acum_end_dt: toolInput.previous_acum_end,
        season_end_dt: toolInput.previous_season_end,
      },
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_top_selling_styles') {
    const limit = Math.min(Math.max(1, toolInput.limit || 20), 50);
    console.log(`[Tool] get_top_selling_styles — ${limit}개, ${toolInput.start_dt}~${toolInput.end_dt}`);
    const filters = [{ system_code: 'ST', system_field_name: 'BRD_CD' }];
    if (toolInput.category) filters.push({ system_code: toolInput.category, system_field_name: 'ITEM_GROUP' });
    if (toolInput.gender) filters.push({ system_code: toolInput.gender, system_field_name: 'SEX_NM' });
    const result = await getStyleRanking({
      filters_product: filters,
      periods: { start_dt: toolInput.start_dt, end_dt: toolInput.end_dt },
      meta_info: { requested_record_rows: limit, data_size_only: false, sql_only: false, with_sql: false, data_type: 'list' },
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_similar_styles') {
    console.log(`[Tool] get_similar_styles — ${toolInput.prdt_cd}`);
    const result = await getSimilarProducts({
      filters: [{ system_code: toolInput.prdt_cd, system_field_name: 'PRDT_CD' }],
    });
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_product_stock_info') {
    console.log(`[Tool] get_product_stock_info`);
    const result = await getProductStock({
      filters_product: toolInput.filters,
      end_dt: toolInput.end_dt,
    });
    return JSON.stringify(result, null, 2);
  }

  // 이서연(Market Agent) 도구
  if (toolName === 'query_competitors') {
    console.log(`[Tool] query_competitors — filters:`, JSON.stringify(toolInput));
    const result = queryProducts(toolInput);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_brand_summary') {
    console.log(`[Tool] get_brand_summary — ${toolInput.brand || '전체'}`);
    const result = getBrandSummary(toolInput.brand);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'compare_brands') {
    console.log(`[Tool] compare_brands — ${toolInput.metric}`);
    const result = compareBrands(toolInput.metric);
    return JSON.stringify(result, null, 2);
  }

  throw new Error(`알 수 없는 도구: ${toolName}`);
}

// ── 1:1 대화 처리 (tool_use 루프 지원) ───────────────────────────────────────

async function handleChat(ws, agentId, userMessage) {
  const agent = getAgent(agentId);
  if (!agent) {
    ws.send(JSON.stringify({ type: 'error', message: '에이전트를 찾을 수 없습니다' }));
    return;
  }

  addMessage(agentId, 'user', userMessage);

  // 로컬 로그 기록
  appendChatLog(agentId, '사용자', userMessage);
  logUserInstruction(agentId, userMessage);

  // 이서연(1) + 김하늘(2) + 박도현(3) + 최재원(4) tool_use 활성화
  const tools = getToolsForAgent(agentId);
  const useTools = !!tools;

  ws.send(JSON.stringify({ type: 'stream_start', agentId, agentName: agent.name }));

  try {
    let fullResponse = '';
    let loopCount = 0;
    const maxLoops = 5; // tool_use 최대 반복 횟수

    while (loopCount < maxLoops) {
      loopCount++;
      const messages = getConversation(agentId);

      const apiParams = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: agent.systemPrompt,
        messages,
      };

      if (tools) {
        apiParams.tools = tools;
      }

      // 스트리밍으로 호출
      const stream = anthropic.messages.stream(apiParams);

      let turnText = '';
      let toolUseBlocks = [];

      stream.on('text', (text) => {
        turnText += text;
        ws.send(JSON.stringify({ type: 'stream_delta', agentId, delta: text }));
      });

      const finalMessage = await stream.finalMessage();

      // tool_use 블록 수집
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // tool_use가 없으면 최종 응답 — 루프 종료
      if (toolUseBlocks.length === 0) {
        fullResponse += turnText;
        break;
      }

      // tool_use가 있으면: assistant 메시지 저장 → tool 실행 → tool_result 저장
      addMessage(agentId, 'assistant', finalMessage.content);

      // 데이터 조회 중 알림
      ws.send(JSON.stringify({
        type: 'stream_delta', agentId,
        delta: '\n\n📊 *데이터 조회 중...*\n\n'
      }));
      fullResponse += turnText + '\n\n📊 *데이터 조회 중...*\n\n';

      // 각 tool 실행 및 결과 수집
      const sendFn = (msg) => ws.send(JSON.stringify(msg));
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await executeTool(toolBlock.name, toolBlock.input, { sendFn, callingAgentId: agentId });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result
          });
          console.log(`[Tool] ${toolBlock.name} 성공 (${result.length} chars)`);

          // 결과물 패널용 tool_activity 전송 + 로컬 로그
          sendToolActivity(ws, agentId, agent.name, toolBlock.name, toolBlock.input, result, true);
          logToolUse(agentId, toolBlock.name, TOOL_LABELS[toolBlock.name] || toolBlock.name);
        } catch (err) {
          console.error(`[Tool Error] ${toolBlock.name}:`, err.message);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `오류: ${err.message}`,
            is_error: true
          });
          sendToolActivity(ws, agentId, agent.name, toolBlock.name, toolBlock.input, err.message, false);
        }
      }

      // tool_result를 user 메시지로 추가 (Claude API 규약)
      addMessage(agentId, 'user', toolResults);
    }

    // 최종 텍스트 응답 저장 (tool_use 블록이 아닌 경우만)
    if (typeof getConversation(agentId).at(-1)?.content === 'string' ||
        !getConversation(agentId).length) {
      // 이미 저장됨 (tool 루프를 안 탄 경우)
    }
    const lastMsg = getConversation(agentId).at(-1);
    if (!lastMsg || lastMsg.role !== 'assistant') {
      addMessage(agentId, 'assistant', fullResponse);
    }

    // 로컬 로그 기록 + STATUS 업데이트
    appendChatLog(agentId, agent.name, fullResponse);
    updateAgentStatus(agentId);

    // CEO 결재 요청 파싱
    if (agentId === 0 && fullResponse.includes('[결재요청]')) {
      sendApprovalRequests(ws, agentId, agent.name, fullResponse);
    }

    ws.send(JSON.stringify({ type: 'stream_end', agentId }));

  } catch (err) {
    console.error('[API Error]', err.message);
    ws.send(JSON.stringify({
      type: 'error',
      agentId,
      message: `API 오류: ${err.message}`
    }));
  }
}

// ── 에이전트별 로컬 로그 & STATUS 자동 업데이트 ──────────────────────────────

const AGENT_FOLDERS = {
  0: path.join(__dirname, '..', 'CEO'),
  1: path.join(__dirname, '..', 'Market Agent'),
  2: path.join(__dirname, '..', 'Consumer Trend Agent'),
  3: path.join(__dirname, '..', 'Product Planning Agent'),
  4: path.join(__dirname, '..', 'Data Analyst Agent'),
};

const AGENT_NAMES = { 0: '한준혁', 1: '이서연', 2: '김하늘', 3: '박도현', 4: '최재원' };

// 에이전트별 최근 활동 추적 (STATUS 업데이트용)
const agentActivity = {
  0: { recentTasks: [], recentTools: [], lastActive: null },
  1: { recentTasks: [], recentTools: [], lastActive: null },
  2: { recentTasks: [], recentTools: [], lastActive: null },
  3: { recentTasks: [], recentTools: [], lastActive: null },
  4: { recentTasks: [], recentTools: [], lastActive: null },
};

function getDateStr() {
  return new Date().toISOString().split('T')[0];
}

function getTimeStr() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// 대화 로그 저장 (에이전트 폴더/logs/YYYY-MM-DD.md에 append)
function appendChatLog(agentId, role, content) {
  try {
    const folder = AGENT_FOLDERS[agentId];
    if (!folder) return;
    const logsDir = path.join(folder, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const logFile = path.join(logsDir, `${getDateStr()}.md`);
    const time = getTimeStr();
    const text = typeof content === 'string' ? content : JSON.stringify(content).slice(0, 500);
    const preview = text.length > 300 ? text.slice(0, 300) + '...' : text;
    const line = `\n### ${time} [${role}]\n${preview}\n`;

    // 파일이 없으면 헤더 추가
    if (!fs.existsSync(logFile)) {
      const header = `# ${AGENT_NAMES[agentId]} — 대화 로그 (${getDateStr()})\n`;
      fs.writeFileSync(logFile, header, 'utf-8');
    }
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (err) {
    console.error(`[Log Error] agent ${agentId}:`, err.message);
  }
}

// 도구 사용 기록
function logToolUse(agentId, toolName, toolLabel) {
  const act = agentActivity[agentId];
  if (!act) return;
  act.lastActive = new Date().toISOString();
  const entry = `${getTimeStr()} ${toolLabel}`;
  act.recentTools.unshift(entry);
  if (act.recentTools.length > 10) act.recentTools.pop();
}

// 사용자 지시 기록
function logUserInstruction(agentId, instruction) {
  const act = agentActivity[agentId];
  if (!act) return;
  act.lastActive = new Date().toISOString();
  const entry = `${getTimeStr()} ${instruction.slice(0, 80)}`;
  act.recentTasks.unshift(entry);
  if (act.recentTasks.length > 10) act.recentTasks.pop();
}

// STATUS.md 자동 업데이트
function updateAgentStatus(agentId) {
  try {
    const folder = AGENT_FOLDERS[agentId];
    if (!folder) return;
    const statusFile = path.join(folder, 'STATUS.md');
    if (!fs.existsSync(statusFile)) return;

    let content = fs.readFileSync(statusFile, 'utf-8');
    const act = agentActivity[agentId];
    const now = getDateStr();

    // 최종 업데이트 날짜 갱신
    content = content.replace(/> 최종 업데이트: .+/, `> 최종 업데이트: ${now}`);

    // 최근 분석/결재 이력 업데이트
    const historySection = agentId === 0 ? '## 최근 결재 이력' : '## 최근 분석 이력';
    const historyIdx = content.indexOf(historySection);
    if (historyIdx !== -1) {
      const nextSection = content.indexOf('\n## ', historyIdx + historySection.length);
      const endIdx = nextSection !== -1 ? nextSection : content.length;

      let historyContent = `${historySection}\n`;
      if (act.recentTasks.length > 0) {
        historyContent += act.recentTasks.map(t => `- ${t}`).join('\n') + '\n';
      }
      if (act.recentTools.length > 0) {
        historyContent += '\n**데이터 조회:**\n';
        historyContent += act.recentTools.map(t => `- ${t}`).join('\n') + '\n';
      }
      if (act.recentTasks.length === 0 && act.recentTools.length === 0) {
        historyContent += '(아직 내역 없음)\n';
      }

      content = content.slice(0, historyIdx) + historyContent + content.slice(endIdx);
    }

    fs.writeFileSync(statusFile, content, 'utf-8');
  } catch (err) {
    console.error(`[Status Update Error] agent ${agentId}:`, err.message);
  }
}

// ── 결재 시스템 ─────────────────────────────────────────────────────────────

let approvalIdCounter = 0;

function parseApprovalRequests(text) {
  const requests = [];
  const regex = /\[결재요청\]\s*\n제목:\s*(.+?)\n내용:\s*([\s\S]+?)\n근거:\s*([\s\S]+?)\n\[\/결재요청\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    requests.push({
      title: match[1].trim(),
      description: match[2].trim(),
      context: match[3].trim(),
    });
  }
  return requests;
}

function sendApprovalRequests(ws, agentId, agentName, responseText) {
  const requests = parseApprovalRequests(responseText);
  for (const req of requests) {
    const id = `approval_${++approvalIdCounter}_${Date.now()}`;
    ws.send(JSON.stringify({
      type: 'approval_request',
      id,
      agentId,
      agentName,
      title: req.title,
      description: req.description,
      context: req.context,
      timestamp: new Date().toISOString(),
    }));
    console.log(`[Approval] ${agentName} → "${req.title}"`);
  }
}

function handleApprovalResponse(ws, msg) {
  const { approvalId, decision, comment } = msg;
  console.log(`[Approval Response] ${approvalId} → ${decision} (${comment || ''})`);

  // CEO 에이전트에게 결재 결과 피드백
  const feedback = decision === 'approved'
    ? `[시스템 알림: 결재 승인됨] 결재가 승인되었습니다. ${comment ? '코멘트: ' + comment : '후속 조치를 안내해주세요.'}`
    : `[시스템 알림: 결재 반려됨] 결재가 반려되었습니다. 사유: ${comment || '사유 없음'}. 대안을 제시해주세요.`;
  addMessage(0, 'user', feedback);

  ws.send(JSON.stringify({
    type: 'approval_resolved',
    approvalId,
    decision,
    timestamp: new Date().toISOString(),
  }));
}

// ── 결과물 패널용 tool_activity 전송 ─────────────────────────────────────────

const TOOL_LABELS = {
  query_channel_sales: '📊 채널 판매 분석',
  get_weekly_summary: '📈 주간 판매 요약',
  get_date_dataset: '📅 날짜 데이터',
  query_competitors: '🔍 경쟁사 검색',
  get_brand_summary: '🏷️ 브랜드 요약',
  compare_brands: '⚖️ 브랜드 비교',
  query_musinsa_ranking: '👕 무신사 랭킹 검색',
  get_musinsa_summary: '📋 무신사 요약',
  get_category_trend: '📊 카테고리 트렌드',
  query_google_trends: '🌐 구글 트렌드 검색',
  get_google_trends_summary: '🌐 구글 트렌드 요약',
  query_tiktok_hashtags: '🎵 TikTok 해시태그 검색',
  get_tiktok_summary: '🎵 TikTok 요약',
  run_musinsa_crawler: '🕷️ 무신사 크롤링',
  run_tiktok_crawler: '🕷️ TikTok 크롤링',
  query_naver_keywords: '🔎 네이버 키워드 검색',
  get_rising_keywords: '🚀 급상승 키워드',
  query_product_info: '📦 상품 마스터 조회',
  query_product_cost: '💰 원가 조회',
  get_category_performance: '📊 카테고리 성과',
  get_top_selling_styles: '🏆 판매 TOP 스타일',
  get_similar_styles: '🔗 유사상품 조회',
  get_product_stock_info: '📦 상품 재고 조회',
  consult_agent: '🤝 에이전트 상담',
};

function buildResultPreview(toolName, rawResult) {
  try {
    const data = JSON.parse(rawResult);

    // 배열 결과: 행 수 + 첫 항목 키
    if (Array.isArray(data)) {
      const count = data.length;
      if (count === 0) return '결과 없음 (0건)';
      const keys = Object.keys(data[0]).slice(0, 4).join(', ');
      return `${count}건 조회 — 컬럼: ${keys}`;
    }

    // 객체 결과: 주요 키-값 요약
    if (typeof data === 'object' && data !== null) {
      // total이 있으면 포함
      if (data.total !== undefined) {
        const entries = Object.entries(data).slice(0, 3).map(([k, v]) => {
          if (typeof v === 'object') return `${k}: (${Array.isArray(v) ? v.length + '건' : '상세'})`;
          return `${k}: ${v}`;
        });
        return entries.join(' | ');
      }
      const entries = Object.entries(data).slice(0, 4).map(([k, v]) => {
        if (typeof v === 'object') return `${k}: (${Array.isArray(v) ? v.length + '건' : '...'})`;
        const s = String(v);
        return `${k}: ${s.length > 30 ? s.slice(0, 30) + '...' : s}`;
      });
      return entries.join(' | ');
    }

    return String(data).slice(0, 100);
  } catch {
    return rawResult.slice(0, 100);
  }
}

function sendToolActivity(ws, agentId, agentName, toolName, toolInput, result, success) {
  try {
    const inputSummary = toolInput.purpose || toolInput.question?.slice(0, 80) || toolInput.sql?.slice(0, 80) || toolInput.brand || toolInput.metric || toolInput.category || JSON.stringify(toolInput).slice(0, 80);
    const preview = success ? buildResultPreview(toolName, result) : `오류: ${result}`;

    ws.send(JSON.stringify({
      type: 'tool_activity',
      agentId,
      agentName,
      toolName,
      toolLabel: TOOL_LABELS[toolName] || toolName,
      inputSummary,
      preview,
      success,
      resultSize: success ? result.length : 0,
      timestamp: new Date().toISOString(),
    }));

    // 차트 데이터 자동 생성 & 전송
    if (success) {
      try {
        const charts = buildCharts(toolName, result);
        for (const chart of charts) {
          ws.send(JSON.stringify({
            type: 'chart_data',
            agentId,
            agentName,
            toolName,
            toolLabel: TOOL_LABELS[toolName] || toolName,
            ...chart,
            timestamp: new Date().toISOString(),
          }));
        }
      } catch (chartErr) {
        // 차트 빌드 실패는 무시 (도구 결과 전달에는 영향 없음)
      }

      // 자동 트리거 체크 (비동기, 오류 무시)
      triggers.checkTriggers(agentId, toolName, result).catch(() => {});
    }
  } catch (err) {
    console.error('[sendToolActivity Error]', err.message);
  }
}

// 브로드캐스트용 sendToolActivity (스케줄러에서 사용)
function broadcastToolActivity(agentId, agentName, toolName, toolInput, result, success) {
  try {
    const inputSummary = toolInput.purpose || toolInput.question?.slice(0, 80) || toolInput.sql?.slice(0, 80) || toolInput.brand || toolInput.metric || toolInput.category || JSON.stringify(toolInput).slice(0, 80);
    const preview = success ? buildResultPreview(toolName, result) : `오류: ${result}`;

    broadcast({
      type: 'tool_activity',
      agentId, agentName, toolName,
      toolLabel: TOOL_LABELS[toolName] || toolName,
      inputSummary, preview, success,
      resultSize: success ? result.length : 0,
      timestamp: new Date().toISOString(),
    });

    if (success) {
      try {
        const charts = buildCharts(toolName, result);
        for (const chart of charts) {
          broadcast({
            type: 'chart_data',
            agentId, agentName, toolName,
            toolLabel: TOOL_LABELS[toolName] || toolName,
            ...chart,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (chartErr) { /* ignore */ }
    }
  } catch (err) {
    console.error('[broadcastToolActivity Error]', err.message);
  }
}

// ── 에이전트별 도구 매핑 ─────────────────────────────────────────────────────

function getToolsForAgent(agentId, includeConsult = true) {
  let tools = [];
  if (agentId === 1) tools = [...MARKET_AGENT_TOOLS];
  else if (agentId === 2) tools = [...TREND_AGENT_TOOLS];
  else if (agentId === 3) tools = [...PRODUCT_PLANNING_TOOLS];
  else if (agentId === 4) tools = [...DATA_ANALYST_TOOLS];

  if (includeConsult) {
    tools.push(buildConsultTool(agentId));
  }

  return tools.length > 0 ? tools : null;
}

// ── 전체 회의 처리 (tool_use 지원) ──────────────────────────────────────────

async function handleMeeting(ws, userMessage) {
  ws.send(JSON.stringify({ type: 'meeting_start' }));

  // CEO(0) → Market(1) → Trend(2) → Product(3) → Data(4) 순서
  const order = [0, 1, 2, 3, 4];
  const allResponses = [];

  for (const agentId of order) {
    const agent = getAgent(agentId);

    // 회의 컨텍스트: 이전 에이전트들의 발언을 포함
    const meetingContext = allResponses.length > 0
      ? `\n\n[회의 진행 상황]\n사용자 질문: "${userMessage}"\n\n` +
        allResponses.map(r => `${r.name} (${r.role}): ${r.content}`).join('\n\n') +
        `\n\n위 동료들의 의견을 참고하여, 당신의 전문 분야 관점에서 답변해주세요. 필요하면 도구를 사용하여 데이터를 조회한 후 답변하세요.`
      : userMessage;

    addMessage(agentId, 'user', meetingContext);

    // 회의 발언 로그 (첫 번째 에이전트에만 사용자 원문 기록)
    if (agentId === order[0]) {
      appendChatLog(agentId, '사용자(회의)', userMessage);
    }

    ws.send(JSON.stringify({ type: 'stream_start', agentId, agentName: agent.name }));

    try {
      let fullResponse = '';
      let loopCount = 0;
      const maxLoops = 3; // 회의 모드에서는 3회로 제한 (속도 유지)
      const tools = getToolsForAgent(agentId);

      while (loopCount < maxLoops) {
        loopCount++;
        const messages = getConversation(agentId);

        const apiParams = {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: agent.systemPrompt + '\n\n[회의 모드] 여러 에이전트가 참여하는 회의입니다. 데이터 조회가 필요하면 도구를 적극 사용하되, 최종 답변은 간결하게 핵심만 정리하세요 (3-7문장).',
          messages,
        };

        if (tools) {
          apiParams.tools = tools;
        }

        const stream = anthropic.messages.stream(apiParams);

        let turnText = '';
        let toolUseBlocks = [];

        stream.on('text', (text) => {
          turnText += text;
          ws.send(JSON.stringify({ type: 'stream_delta', agentId, delta: text }));
        });

        const finalMessage = await stream.finalMessage();

        // tool_use 블록 수집
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            toolUseBlocks.push(block);
          }
        }

        // tool_use가 없으면 최종 응답 — 루프 종료
        if (toolUseBlocks.length === 0) {
          fullResponse += turnText;
          break;
        }

        // tool_use가 있으면: assistant 메시지 저장 → tool 실행 → tool_result 저장
        addMessage(agentId, 'assistant', finalMessage.content);

        // 데이터 조회 중 알림
        ws.send(JSON.stringify({
          type: 'stream_delta', agentId,
          delta: '\n\n📊 *데이터 조회 중...*\n\n'
        }));
        fullResponse += turnText + '\n\n📊 *데이터 조회 중...*\n\n';

        // 각 tool 실행 및 결과 수집
        const sendFn = (msg) => ws.send(JSON.stringify(msg));
        const toolResults = [];
        for (const toolBlock of toolUseBlocks) {
          try {
            const result = await executeTool(toolBlock.name, toolBlock.input, { sendFn, callingAgentId: agentId });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result
            });
            console.log(`[Meeting Tool] ${agent.name} → ${toolBlock.name} 성공 (${result.length} chars)`);
            sendToolActivity(ws, agentId, agent.name, toolBlock.name, toolBlock.input, result, true);
            logToolUse(agentId, toolBlock.name, TOOL_LABELS[toolBlock.name] || toolBlock.name);
          } catch (err) {
            console.error(`[Meeting Tool Error] ${agent.name} → ${toolBlock.name}:`, err.message);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: `오류: ${err.message}`,
              is_error: true
            });
            sendToolActivity(ws, agentId, agent.name, toolBlock.name, toolBlock.input, err.message, false);
          }
        }

        // tool_result를 user 메시지로 추가 (Claude API 규약)
        addMessage(agentId, 'user', toolResults);
      }

      // 최종 텍스트 응답 저장
      const lastMsg = getConversation(agentId).at(-1);
      if (!lastMsg || lastMsg.role !== 'assistant') {
        addMessage(agentId, 'assistant', fullResponse);
      }

      // 로컬 로그 기록 + STATUS 업데이트
      appendChatLog(agentId, agent.name, fullResponse);
      updateAgentStatus(agentId);

      // CEO 결재 요청 파싱
      if (agentId === 0 && fullResponse.includes('[결재요청]')) {
        sendApprovalRequests(ws, agentId, agent.name, fullResponse);
      }

      allResponses.push({ name: agent.name, role: agent.role, content: fullResponse });
      ws.send(JSON.stringify({ type: 'stream_end', agentId }));

    } catch (err) {
      console.error(`[Meeting API Error] ${agent.name}:`, err.message);
      ws.send(JSON.stringify({ type: 'error', agentId, message: `${agent.name} API 오류: ${err.message}` }));
    }
  }

  ws.send(JSON.stringify({ type: 'meeting_end' }));
}

// ── WebSocket 브로드캐스트 ─────────────────────────────────────────────────

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

// ── 스케줄된 자동 분석 실행 ─────────────────────────────────────────────────

async function executeScheduledTask(schedule) {
  const { AGENTS: agentsList } = require('./agents');

  // 실행 시작 알림
  broadcast({
    type: 'auto_report_start',
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    scheduleType: schedule.type,
    agentId: schedule.agentId,
    timestamp: new Date().toISOString(),
  });

  let fullReport = '';

  try {
    if (schedule.type === 'meeting') {
      fullReport = await executeScheduledMeeting(schedule);
    } else {
      fullReport = await executeScheduledChat(schedule);
    }
  } catch (err) {
    console.error(`[Scheduler] 실행 오류: ${err.message}`);
    fullReport = `[자동 분석 오류] ${err.message}`;
    broadcast({ type: 'auto_report_error', scheduleId: schedule.id, error: err.message });
  }

  // 리포트 저장
  const agentName = schedule.agentId !== null
    ? (getAgent(schedule.agentId)?.name || '')
    : '전체 회의';
  const report = {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    type: schedule.type,
    agentId: schedule.agentId,
    agentName,
    content: fullReport,
    timestamp: new Date().toISOString(),
  };
  scheduler.saveReport(report);

  // 리포트 완료 알림
  broadcast({
    type: 'auto_report',
    ...report,
    preview: fullReport.slice(0, 300),
  });

  return fullReport;
}

async function executeScheduledChat(schedule) {
  const agent = getAgent(schedule.agentId);
  if (!agent) throw new Error(`에이전트 ${schedule.agentId} 없음`);

  const instruction = `[자동 분석 요청] ${schedule.instruction}\n\n데이터를 조회하여 구체적인 수치와 함께 분석 리포트를 작성해주세요.`;

  addMessage(schedule.agentId, 'user', instruction);
  appendChatLog(schedule.agentId, '자동 스케줄', instruction.slice(0, 100));
  logUserInstruction(schedule.agentId, `[자동] ${schedule.name}`);

  // 스트리밍 시작 브로드캐스트
  broadcast({ type: 'stream_start', agentId: schedule.agentId, agentName: agent.name, source: 'scheduled' });

  let fullResponse = '';
  let loopCount = 0;
  const maxLoops = 5;
  const tools = getToolsForAgent(schedule.agentId);

  while (loopCount < maxLoops) {
    loopCount++;
    const messages = getConversation(schedule.agentId);

    const apiParams = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: agent.systemPrompt + '\n\n[자동 분석 모드] 정기 리포트를 작성 중입니다. 도구를 적극 사용하여 최신 데이터를 조회하고, 핵심 인사이트를 구조화된 형태로 정리해주세요.',
      messages,
    };
    if (tools) apiParams.tools = tools;

    const stream = anthropic.messages.stream(apiParams);
    let turnText = '';
    let toolUseBlocks = [];

    stream.on('text', (text) => {
      turnText += text;
      broadcast({ type: 'stream_delta', agentId: schedule.agentId, delta: text, source: 'scheduled' });
    });

    const finalMessage = await stream.finalMessage();

    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') toolUseBlocks.push(block);
    }

    if (toolUseBlocks.length === 0) {
      fullResponse += turnText;
      break;
    }

    addMessage(schedule.agentId, 'assistant', finalMessage.content);
    broadcast({ type: 'stream_delta', agentId: schedule.agentId, delta: '\n\n📊 *데이터 조회 중...*\n\n', source: 'scheduled' });
    fullResponse += turnText + '\n\n📊 *데이터 조회 중...*\n\n';

    const toolResults = [];
    for (const toolBlock of toolUseBlocks) {
      try {
        const result = await executeTool(toolBlock.name, toolBlock.input);
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
        // tool_activity 브로드캐스트
        const inputSummary = toolBlock.input.purpose || toolBlock.input.sql?.slice(0, 80) || JSON.stringify(toolBlock.input).slice(0, 80);
        const preview = buildResultPreview(toolBlock.name, result);
        broadcast({
          type: 'tool_activity', agentId: schedule.agentId, agentName: agent.name,
          toolName: toolBlock.name, toolLabel: TOOL_LABELS[toolBlock.name] || toolBlock.name,
          inputSummary, preview, success: true, resultSize: result.length,
          timestamp: new Date().toISOString(), source: 'scheduled',
        });
        logToolUse(schedule.agentId, toolBlock.name, TOOL_LABELS[toolBlock.name] || toolBlock.name);
      } catch (err) {
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: `오류: ${err.message}`, is_error: true });
      }
    }
    addMessage(schedule.agentId, 'user', toolResults);
  }

  const lastMsg = getConversation(schedule.agentId).at(-1);
  if (!lastMsg || lastMsg.role !== 'assistant') {
    addMessage(schedule.agentId, 'assistant', fullResponse);
  }

  appendChatLog(schedule.agentId, agent.name, fullResponse);
  updateAgentStatus(schedule.agentId);

  broadcast({ type: 'stream_end', agentId: schedule.agentId, source: 'scheduled' });
  return fullResponse;
}

async function executeScheduledMeeting(schedule) {
  broadcast({ type: 'meeting_start', source: 'scheduled' });

  const order = [0, 1, 2, 3, 4];
  const allResponses = [];
  let fullReport = '';

  for (const agentId of order) {
    const agent = getAgent(agentId);
    const meetingContext = allResponses.length > 0
      ? `\n\n[자동 정기 회의]\n주제: "${schedule.instruction}"\n\n` +
        allResponses.map(r => `${r.name} (${r.role}): ${r.content}`).join('\n\n') +
        `\n\n위 동료들의 의견을 참고하여 답변하세요. 필요하면 도구를 사용하세요.`
      : `[자동 정기 회의] ${schedule.instruction}`;

    addMessage(agentId, 'user', meetingContext);
    broadcast({ type: 'stream_start', agentId, agentName: agent.name, source: 'scheduled' });

    let fullResponse = '';
    let loopCount = 0;
    const maxLoops = 3;
    const tools = getToolsForAgent(agentId);

    while (loopCount < maxLoops) {
      loopCount++;
      const messages = getConversation(agentId);
      const apiParams = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: agent.systemPrompt + '\n\n[자동 정기 회의] 데이터 조회가 필요하면 도구를 적극 사용하되, 최종 답변은 간결하게 핵심만 정리하세요 (3-7문장).',
        messages,
      };
      if (tools) apiParams.tools = tools;

      const stream = anthropic.messages.stream(apiParams);
      let turnText = '';
      let toolUseBlocks = [];

      stream.on('text', (text) => {
        turnText += text;
        broadcast({ type: 'stream_delta', agentId, delta: text, source: 'scheduled' });
      });

      const finalMessage = await stream.finalMessage();
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') toolUseBlocks.push(block);
      }

      if (toolUseBlocks.length === 0) { fullResponse += turnText; break; }

      addMessage(agentId, 'assistant', finalMessage.content);
      broadcast({ type: 'stream_delta', agentId, delta: '\n\n📊 *데이터 조회 중...*\n\n', source: 'scheduled' });
      fullResponse += turnText + '\n\n📊 *데이터 조회 중...*\n\n';

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await executeTool(toolBlock.name, toolBlock.input);
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
          const inputSummary = toolBlock.input.purpose || toolBlock.input.sql?.slice(0, 80) || JSON.stringify(toolBlock.input).slice(0, 80);
          broadcast({
            type: 'tool_activity', agentId, agentName: agent.name,
            toolName: toolBlock.name, toolLabel: TOOL_LABELS[toolBlock.name] || toolBlock.name,
            inputSummary, preview: buildResultPreview(toolBlock.name, result),
            success: true, resultSize: result.length, timestamp: new Date().toISOString(), source: 'scheduled',
          });
          logToolUse(agentId, toolBlock.name, TOOL_LABELS[toolBlock.name] || toolBlock.name);
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: `오류: ${err.message}`, is_error: true });
        }
      }
      addMessage(agentId, 'user', toolResults);
    }

    const lastMsg = getConversation(agentId).at(-1);
    if (!lastMsg || lastMsg.role !== 'assistant') addMessage(agentId, 'assistant', fullResponse);

    appendChatLog(agentId, agent.name, fullResponse);
    updateAgentStatus(agentId);

    allResponses.push({ name: agent.name, role: agent.role, content: fullResponse });
    fullReport += `\n\n━━ ${agent.name} (${agent.role}) ━━\n${fullResponse}`;
    broadcast({ type: 'stream_end', agentId, source: 'scheduled' });
  }

  broadcast({ type: 'meeting_end', source: 'scheduled' });
  return fullReport;
}

// ── 스케줄러 & 트리거 콜백 등록 ──────────────────────────────────────────

scheduler.setExecuteCallback(executeScheduledTask);

triggers.setTriggerExecuteCallback(async (trigger, instruction, summary) => {
  // 트리거 발동 알림 브로드캐스트
  broadcast({
    type: 'trigger_fired',
    triggerId: trigger.id,
    triggerName: trigger.name,
    sourceAgentId: trigger.sourceAgentId,
    targetAgentId: trigger.targetAgentId,
    summary,
    timestamp: new Date().toISOString(),
  });

  // 타겟 에이전트에게 자동 분석 실행 (스케줄러 재활용)
  const pseudoSchedule = {
    id: `trigger_${trigger.id}`,
    name: `[트리거] ${trigger.name}`,
    type: 'chat',
    agentId: trigger.targetAgentId,
    instruction,
  };
  await executeScheduledTask(pseudoSchedule);
});

// ── 서버 시작 ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🏢 AI Office Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT}/ai_agents_office.html in browser`);

  // 무신사 랭킹 데이터 로드
  console.log(`📈 무신사 랭킹 데이터 로드 중...`);
  try {
    const musinsaResult = loadMusinsaData();
    if (musinsaResult.total > 0) {
      console.log(`📈 무신사 데이터 로드 완료 — 김하늘 트렌드 분석 활성화 (${musinsaResult.total}개 상품)`);
    }
  } catch (err) {
    console.log(`⚠️  무신사 데이터 로드 실패: ${err.message}`);
  }

  // Google Trends 데이터 로드
  console.log(`📊 Google Trends 데이터 로드 중...`);
  try {
    const gtResult = loadGoogleTrends();
    if (gtResult.total > 0) {
      console.log(`📊 Google Trends 로드 완료 — ${gtResult.total}개 키워드 (${gtResult.date})`);
    }
  } catch (err) {
    console.log(`⚠️  Google Trends 로드 실패: ${err.message}`);
  }

  // TikTok 해시태그 데이터 로드
  console.log(`🎵 TikTok 해시태그 데이터 로드 중...`);
  try {
    const tiktokResult = loadTiktokData();
    if (tiktokResult.total > 0) {
      console.log(`🎵 TikTok 데이터 로드 완료 — 김하늘 트렌드 분석 활성화 (${tiktokResult.total}개 해시태그)`);
    }
  } catch (err) {
    console.log(`⚠️  TikTok 데이터 로드 실패: ${err.message}`);
  }

  // 경쟁사 데이터 로드
  console.log(`🔍 경쟁사 데이터 로드 중...`);
  try {
    const { total, errors } = loadAll();
    if (total > 0) {
      console.log(`🔍 경쟁사 데이터 로드 완료 — 이서연 시장 분석 활성화 (${total}개 상품)`);
    }
    if (errors.length) {
      console.log(`⚠️  일부 로드 실패: ${errors.join(', ')}`);
    }
  } catch (err) {
    console.log(`⚠️  경쟁사 데이터 로드 실패: ${err.message} — 이서연은 도구 없이 동작합니다`);
  }

  // 스케줄러 초기화
  console.log(`⏰ 스케줄러 초기화 중...`);
  scheduler.loadSchedules();
  scheduler.loadReports();
  scheduler.startAllTimers();
  console.log(`⏰ 스케줄러 준비 완료`);

  // 트리거 초기화
  console.log(`🔔 트리거 초기화 중...`);
  triggers.loadTriggers();
  console.log(`🔔 트리거 준비 완료\n`);

  // KG API 연결 테스트 (최재원용)
  console.log(`🔗 KG API 연결 테스트 중...`);
  testKgConnection()
    .then(ok => {
      if (ok) console.log(`🔗 KG API 연결 완료 — 최재원 채널 판매 분석 활성화\n`);
      else console.log(`⚠️  KG API 연결 실패 — 최재원은 도구 없이 동작합니다\n`);
    });

  // Snowflake는 더 이상 에이전트에 필요하지 않음 (전원 KG API로 전환)
  console.log(`✅ 모든 에이전트 KG API 전환 완료 — Snowflake 직접 접속 불필요\n`);
});
