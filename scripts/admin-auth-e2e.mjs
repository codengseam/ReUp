// 直接调用 route handler 验证 E2E：admin 鉴权 3 步
// 1. POST 正确账号密码 → 200 + Set-Cookie
// 2. POST 错误密码 → 401
// 3. POST 错误账号 → 401
// 4. POST 错误请求体 → 400
// 5. GET 携带有效 cookie → authenticated:true
// 6. DELETE 清除 cookie → success
// 7. 篡改 cookie 防御

process.env.ADMIN_USERNAME = 'boss';
process.env.ADMIN_PASSWORD = 's3cret-pass';
process.env.ADMIN_SESSION_SECRET = 'unit-test-secret-32-bytes-12345678';

const { POST, GET, DELETE } = await import('../src/app/api/admin/auth/route.ts');

function makePostReq(body) {
  return new Request('http://localhost/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { console.log('  PASS', label); passed++; }
  else { console.log('  FAIL', label); failed++; }
}

// 1. 正确凭证
console.log('[1] POST 正确凭证:');
const r1 = await POST(makePostReq({ username: 'boss', password: 's3cret-pass' }));
assert(r1.status === 200, 'status=200');
const setCookie = r1.headers.get('set-cookie') || '';
assert(setCookie.includes('boss_admin_session='), 'set-cookie 包含 boss_admin_session');
assert(setCookie.includes('HttpOnly'), 'httpOnly 标志');
const cookieValue = setCookie.match(/boss_admin_session=([^;]+)/)[1];
assert(typeof cookieValue === 'string' && cookieValue.length > 0, 'cookie 值非空');

// 2. 错误密码
console.log('[2] POST 错误密码:');
const r2 = await POST(makePostReq({ username: 'boss', password: 'wrong' }));
assert(r2.status === 401, 'status=401');
const d2 = await r2.json();
assert(d2.error === 'bad_credentials', 'error=bad_credentials');

// 3. 错误账号
console.log('[3] POST 错误账号:');
const r3 = await POST(makePostReq({ username: 'notboss', password: 's3cret-pass' }));
assert(r3.status === 401, 'status=401');

// 4. 错误请求体
console.log('[4] POST 错误请求体:');
const r4 = await POST({ json: async () => { throw new Error('bad json'); } });
assert(r4.status === 400, 'status=400');

// 5. cookie 跨请求有效：sign 一次，verify 多次（模拟"首次签发 → 后续请求都验签"）
console.log('[5] cookie 跨请求有效:');
const { signCookie, verifyCookie, COOKIE_PAYLOAD } = await import('../src/lib/admin-auth.ts');
const secret = 'unit-test-secret-32-bytes-12345678';
const issued = signCookie(COOKIE_PAYLOAD, secret);
assert(verifyCookie(issued, secret) === true, '第 1 次 verify');
assert(verifyCookie(issued, secret) === true, '第 2 次 verify');
assert(verifyCookie(issued, secret) === true, '第 3 次 verify');
// 改 payload 验签应失败（默认 expectedPayload 是 'authed'，不匹配直接拒绝）
const modified = signCookie('not-authed', secret);
assert(verifyCookie(modified, secret) === false, '改 payload 后用原 secret 验签失败（payload mismatch）');
assert(verifyCookie(modified, secret, 'not-authed') === true, '改 payload 后用对应 expectedPayload 验签通过（HMAC 自洽）');

// 6. 篡改 cookie 防御
console.log('[6] 篡改 cookie 防御:');
const good = signCookie(COOKIE_PAYLOAD, secret);
assert(verifyCookie(good, secret) === true, '正常 cookie 验签通过');
const tampered = good.slice(0, 5) + (good[5] === 'A' ? 'B' : 'A') + good.slice(6);
assert(verifyCookie(tampered, secret) === false, '篡改后验签失败');
const forged = signCookie(COOKIE_PAYLOAD, 'attacker-secret');
assert(verifyCookie(forged, secret) === false, '伪造 secret 验签失败');

// 7. GET 在真实 Next.js 请求作用域外无法直接调用（next/headers 的 cookies() 限制）
//    这里改用纯函数等价路径：通过 set/parse Set-Cookie + verifyCookie 模拟"跨请求"
console.log('[7] 模拟 GET（带 cookie 请求）:');
const cookieHeader = `boss_admin_session=${issued}`;
const parsed = cookieHeader.match(/boss_admin_session=([^;]+)/)[1];
assert(verifyCookie(parsed, secret) === true, '从请求头取出 cookie 后验签通过');

// 8. DELETE 不会失败（不需要 cookies() 上下文）
console.log('[8] DELETE 清除 cookie:');
const r8 = await DELETE();
assert(r8.status === 200, 'status=200');
const delCookie = r8.headers.get('set-cookie') || '';
assert(delCookie.includes('boss_admin_session=') && delCookie.includes('Expires=Thu, 01 Jan 1970'), 'cookie 过期');

console.log('');
console.log(`Total: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
