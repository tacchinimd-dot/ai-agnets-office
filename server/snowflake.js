// snowflake.js — Snowflake 연결 및 안전한 쿼리 실행

const snowflake = require('snowflake-sdk');

// 글로벌 로깅 비활성화 (콘솔 노이즈 방지)
snowflake.configure({ logLevel: 'OFF' });

let connection = null;
let connecting = false;
const connectQueue = [];

function getConnection() {
  return new Promise((resolve, reject) => {
    if (connection && connection.isUp()) {
      return resolve(connection);
    }

    connectQueue.push({ resolve, reject });

    if (connecting) return;
    connecting = true;

    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.SNOWFLAKE_USER,
      password: process.env.SNOWFLAKE_PASSWORD,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      database: process.env.SNOWFLAKE_DATABASE,
      role: process.env.SNOWFLAKE_ROLE,
    });

    conn.connect((err, conn) => {
      connecting = false;
      if (err) {
        console.error('[Snowflake] 연결 실패:', err.message);
        while (connectQueue.length) connectQueue.shift().reject(err);
        return;
      }
      console.log('[Snowflake] 연결 성공');
      connection = conn;
      while (connectQueue.length) connectQueue.shift().resolve(conn);
    });
  });
}

// SQL 안전성 검증
function validateQuery(sql) {
  const trimmed = sql.trim().toUpperCase();

  // SELECT만 허용
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('SELECT/WITH 쿼리만 허용됩니다.');
  }

  // DDL/DML 키워드 차단
  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|REPLACE|GRANT|REVOKE|EXEC|EXECUTE|CALL)\b/i;
  if (blocked.test(sql)) {
    throw new Error('데이터 변경 쿼리는 허용되지 않습니다.');
  }

  // 세미콜론으로 멀티쿼리 차단 (문자열 리터럴 내부 제외는 간소화)
  const withoutStrings = sql.replace(/'[^']*'/g, '');
  if (withoutStrings.includes(';')) {
    throw new Error('복수 쿼리는 허용되지 않습니다.');
  }

  return true;
}

// LIMIT 강제 (없으면 200행 제한)
function ensureLimit(sql, maxRows = 200) {
  const upper = sql.trim().toUpperCase();
  if (!upper.includes('LIMIT')) {
    return sql.trimEnd().replace(/;?\s*$/, '') + ` LIMIT ${maxRows}`;
  }
  return sql;
}

// 쿼리 실행
async function executeQuery(sql, timeoutMs = 30000) {
  validateQuery(sql);
  const safeSql = ensureLimit(sql);

  const conn = await getConnection();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('쿼리 타임아웃 (30초)'));
    }, timeoutMs);

    conn.execute({
      sqlText: safeSql,
      complete: (err, stmt, rows) => {
        clearTimeout(timer);
        if (err) {
          reject(new Error(`쿼리 실행 오류: ${err.message}`));
          return;
        }

        // 결과를 간결한 형태로 변환
        const columns = stmt.getColumns().map(c => c.getName());
        const data = rows.map(row => {
          const obj = {};
          columns.forEach(col => { obj[col] = row[col]; });
          return obj;
        });

        resolve({
          columns,
          data,
          rowCount: rows.length,
          sql: safeSql
        });
      }
    });
  });
}

// 연결 상태 확인
function isConnected() {
  return connection && connection.isUp();
}

module.exports = { executeQuery, isConnected, getConnection };
