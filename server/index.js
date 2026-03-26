require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { AGENTS, getAgent, getConversation, addMessage, clearConversation, clearAllConversations } = require('./agents');
const { DATA_ANALYST_TOOLS, buildWeeklySummarySQL } = require('./tools');
const { MARKET_AGENT_TOOLS } = require('./market-tools');
const { TREND_AGENT_TOOLS, loadMusinsaData, loadTiktokData, queryRanking, getRankingSummary, getCategoryTrend, queryTiktokHashtags, getTiktokSummary, buildRisingKeywordsSQL, runMusinsaCrawler, runTiktokCrawler } = require('./trend-tools');
const { executeQuery, isConnected } = require('./snowflake');
const { loadAll, queryProducts, getBrandSummary, compareBrands, getProductCount } = require('./competitors');

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
      // 1:1 대화
      await handleChat(ws, agentId, content);
    } else if (type === 'meeting') {
      // 전체 회의 — 5명 순차 응답
      await handleMeeting(ws, content);
    }
  });

  ws.on('close', () => console.log('[WS] 클라이언트 연결 해제'));
});

// ── Tool 실행 핸들러 ─────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput) {
  if (toolName === 'query_snowflake') {
    console.log(`[Tool] query_snowflake — ${toolInput.purpose}`);
    console.log(`[Tool] SQL: ${toolInput.sql}`);
    const result = await executeQuery(toolInput.sql);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_weekly_summary') {
    const sql = buildWeeklySummarySQL(toolInput.weeks, toolInput.metric);
    console.log(`[Tool] get_weekly_summary — ${toolInput.weeks}주, ${toolInput.metric}`);
    const result = await executeQuery(sql);
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

  if (toolName === 'query_naver_keywords') {
    console.log(`[Tool] query_naver_keywords — ${toolInput.purpose}`);
    console.log(`[Tool] SQL: ${toolInput.sql}`);
    const result = await executeQuery(toolInput.sql);
    return JSON.stringify(result, null, 2);
  }

  if (toolName === 'get_rising_keywords') {
    const sql = buildRisingKeywordsSQL(toolInput.direction, toolInput.limit);
    console.log(`[Tool] get_rising_keywords — ${toolInput.direction}, limit=${toolInput.limit || 20}`);
    const result = await executeQuery(sql);
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

  // 이서연(1) + 김하늘(2) + 최재원(4) tool_use 활성화
  const useTools = agentId === 1 || agentId === 2 || agentId === 4;

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

      if (agentId === 1) {
        apiParams.tools = MARKET_AGENT_TOOLS;
      } else if (agentId === 2) {
        apiParams.tools = TREND_AGENT_TOOLS;
      } else if (agentId === 4) {
        apiParams.tools = DATA_ANALYST_TOOLS;
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
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await executeTool(toolBlock.name, toolBlock.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result
          });
          console.log(`[Tool] ${toolBlock.name} 성공 (${result.length} chars)`);
        } catch (err) {
          console.error(`[Tool Error] ${toolBlock.name}:`, err.message);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `오류: ${err.message}`,
            is_error: true
          });
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

// ── 전체 회의 처리 ───────────────────────────────────────────────────────────

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
        `\n\n위 동료들의 의견을 참고하여, 당신의 전문 분야 관점에서 답변해주세요.`
      : userMessage;

    addMessage(agentId, 'user', meetingContext);
    const messages = getConversation(agentId);

    ws.send(JSON.stringify({ type: 'stream_start', agentId, agentName: agent.name }));

    try {
      const stream = anthropic.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: agent.systemPrompt + '\n\n[회의 모드] 여러 에이전트가 참여하는 회의입니다. 간결하게 핵심만 답변하세요 (3-5문장).',
        messages
      });

      let fullResponse = '';

      stream.on('text', (text) => {
        fullResponse += text;
        ws.send(JSON.stringify({ type: 'stream_delta', agentId, delta: text }));
      });

      await stream.finalMessage();

      addMessage(agentId, 'assistant', fullResponse);
      allResponses.push({ name: agent.name, role: agent.role, content: fullResponse });
      ws.send(JSON.stringify({ type: 'stream_end', agentId }));

    } catch (err) {
      console.error(`[Meeting API Error] ${agent.name}:`, err.message);
      ws.send(JSON.stringify({ type: 'error', agentId, message: `${agent.name} API 오류: ${err.message}` }));
    }
  }

  ws.send(JSON.stringify({ type: 'meeting_end' }));
}

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

  // Snowflake 사전 연결 시도
  if (process.env.SNOWFLAKE_PASSWORD && process.env.SNOWFLAKE_PASSWORD !== 'your-snowflake-password-here') {
    console.log(`❄️  Snowflake 연결 시도 중...`);
    getConnection()
      .then(() => console.log(`❄️  Snowflake 연결 완료 — 최재원 데이터 분석 활성화\n`))
      .catch(err => console.log(`⚠️  Snowflake 연결 실패: ${err.message} — 최재원은 도구 없이 동작합니다\n`));
  } else {
    console.log(`⚠️  Snowflake 미설정 — .env에 SNOWFLAKE_PASSWORD를 입력하세요\n`);
  }
});
