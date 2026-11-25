export function desktopPairingPage(locale: 'zh' | 'en', desktopTheme: string): string {
  const zh = locale === 'zh'
  const strings = zh
    ? {
      title: '连接手机',
      hint: '用微信扫码，登录与电脑相同的账号，然后在电脑上同意连接。链接会保存在本机，重启电脑端后仍可继续使用。',
      loading: '正在连接青狮官网…',
      waiting: '等待手机配对',
      reconnecting: '正在重新连接官网…',
      connected: '手机已连接',
      away: '已配对，手机暂离',
      awayHint: '在手机上重新打开配对页面即可恢复连接。',
      connectedHint: '可以关闭此窗口；重启电脑端后，手机用同一链接即可继续连接。断开后，手机需要重新扫码。',
      requested: '手机请求连接',
      denied: '已拒绝本次申请',
      requestHint: '同意后，这部手机可以查看此电脑的会话并发送消息。',
      approve: '同意连接',
      deny: '拒绝',
      decisionFailed: '操作未完成，请重试。',
      expires: '二维码剩余',
      seconds: '秒',
      qrLabel: '用微信扫码连接此电脑',
      linkLabel: '手机连接链接',
      copy: '复制链接',
      copied: '已复制',
      copyError: '请选中链接复制',
      disconnect: '断开连接',
      refresh: '重新生成',
      retry: '重试',
      signin: '请先登录青狮账号，再重新连接。',
      unavailable: '官网远程连接服务暂不可用。',
      failed: '无法连接青狮官网，请检查网络后重试。',
      disconnected: '连接已断开',
    }
    : {
      title: 'Connect a phone',
      hint: 'Scan with WeChat, sign in with the account on this computer, then approve the request here. The link is stored on this computer, so it keeps working after a restart.',
      loading: 'Connecting to QingClaw…',
      waiting: 'Waiting for your phone',
      reconnecting: 'Reconnecting to QingClaw…',
      connected: 'Phone connected',
      away: 'Paired · Phone offline',
      awayHint: 'Reopen the pairing page on your phone to reconnect.',
      connectedHint: 'You can close this window; after a desktop restart the phone keeps working with the same link. After disconnecting, scan a new code to pair again.',
      requested: 'A phone is requesting access',
      denied: 'Connection request denied',
      requestHint: 'Allow this phone to view conversations on this computer and send messages.',
      approve: 'Allow connection',
      deny: 'Deny',
      decisionFailed: 'Could not complete your request. Try again.',
      expires: 'QR code expires in',
      seconds: 's',
      qrLabel: 'Scan with WeChat to connect to this computer',
      linkLabel: 'Phone connection link',
      copy: 'Copy link',
      copied: 'Copied',
      copyError: 'Select the link to copy it',
      disconnect: 'Disconnect',
      refresh: 'New code',
      retry: 'Retry',
      signin: 'Sign in to QingClaw, then try again.',
      unavailable: 'The remote connection service is unavailable.',
      failed: 'Could not reach QingClaw. Check your connection and try again.',
      disconnected: 'Disconnected',
    }
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${strings.title}</title><style>${desktopTheme}</style><style>
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); -webkit-font-smoothing: antialiased; }
main { margin: auto; max-width: 480px; padding: 24px; }
header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
header svg { width: 22px; height: 22px; flex: none; }
h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 500; }
.connection { padding: 18px; border-radius: 16px; background: var(--dsw-alias-bg-module-platform); }
#state { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; line-height: 22px; font-weight: 500; }
#state::before { content: ""; width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-label-tertiary); }
[data-phase="connected"] #state::before { background: var(--dsw-alias-state-success-primary); }
[data-phase="requested"] #state::before, [data-phase="waiting"] #state::before { background: var(--dsw-alias-link); }
[data-phase="failed"] #state::before, [data-phase="unavailable"] #state::before { background: var(--dsw-alias-state-error-primary); }
#hint, #timer, #error { margin: 6px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
#hint:empty, #error:empty { display: none; }
#panel { margin-top: 16px; text-align: center; }
#qr { display: block; width: 196px; max-width: 100%; height: auto; aspect-ratio: 1; margin: auto; padding: 8px;
  border-radius: 12px; background: var(--dsw-static-neutral-bluish-00); image-rendering: pixelated; }
#timer { font-variant-numeric: tabular-nums; }
.link-row { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
#link { flex: 1; min-width: 0; border: 0; padding: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; text-overflow: ellipsis; }
#actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
#actions:not(:has(button:not([hidden]))) { display: none; }
button { font: inherit; font-size: 13px; font-weight: 500; line-height: 20px; min-height: 36px; padding: 7px 14px; border: 0; border-radius: 10px;
  background: var(--dsw-alias-button-primary-dimmed); color: var(--dsw-alias-label-primary); cursor: pointer; }
#copy { min-height: 30px; padding: 4px 10px; border-radius: 7px; }
button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid); }
#approve, #act.primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-inverted); }
#approve:hover:not(:disabled), #act.primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
#link:focus-visible, button:focus-visible { outline: 2px solid var(--dsw-alias-link); outline-offset: 2px; }
#link:focus-visible { outline-offset: 0; }
#link::selection { background: Highlight; color: HighlightText; }
button:disabled { opacity: .5; cursor: default; }
#error { color: var(--dsw-alias-state-error-primary); }
[hidden] { display: none !important; }
</style></head><body><main><header>
<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>
<h1>${strings.title}</h1></header>
<section class="connection" aria-labelledby="state"><p id="state" role="status">${strings.loading}</p><p id="hint"></p>
<div id="panel" hidden><img id="qr" alt="${strings.qrLabel}"><p id="timer"></p></div></section>
<div class="link-row" id="link-row" hidden><input id="link" readonly aria-label="${strings.linkLabel}"><button id="copy" type="button">${strings.copy}</button></div>
<p id="error" role="alert"></p><div id="actions"><button id="deny" hidden type="button">${strings.deny}</button><button id="approve" hidden type="button">${strings.approve}</button><button id="act" hidden type="button"></button></div></main>
<script>
const palette=matchMedia('(prefers-color-scheme: dark)');
function applyPalette(){document.body.toggleAttribute('data-ds-dark-theme',palette.matches)}
applyPalette();palette.addEventListener('change',applyPalette);
const t=${JSON.stringify(strings)}, el=id=>document.getElementById(id);
let info={}, busy=false, poll=null, copiedUntil=0;
function render(){
 const paired=info.paired, pending=Boolean(info.requestId && info.phase==='requested'), show=Boolean(info.qr && info.phase==='waiting');
 document.body.dataset.phase=info.phase;
 const stateText=t[info.phase] || t.loading;
 if(el('state').textContent!==stateText)el('state').textContent=stateText;
 el('hint').textContent=pending?t.requestHint:info.phase==='away'?t.awayHint:info.phase==='connected'?t.connectedHint:show?t.hint:'';
 el('panel').hidden=!show;el('link-row').hidden=!show;
 el('copy').textContent=Date.now()<copiedUntil?t.copied:t.copy;
 if(show){
   if(el('qr').getAttribute('src')!==info.qr)el('qr').src=info.qr;
   el('link').value=info.link;
   el('timer').textContent=t.expires+' '+Math.max(0,Math.ceil((info.pairingExpiresAt-Date.now())/1000))+' '+t.seconds;
 }else{el('qr').removeAttribute('src');el('link').value='';}
 for(const id of ['approve','deny']){el(id).hidden=!pending;el(id).disabled=busy;}
 el('act').hidden=pending || info.phase==='loading';el('act').disabled=busy;
 el('act').classList.toggle('primary',!paired && !show);
 el('act').textContent=paired?t.disconnect:show || info.phase==='denied'?t.refresh:t.retry;
}
async function status(){
 clearTimeout(poll);
 try{const r=await fetch('/desktop/status',{cache:'no-store'});if(!r.ok)throw Error();info=await r.json()}catch{info={phase:'failed'}}
 render();poll=setTimeout(status,1000)
}
for(const action of ['approve','deny']){
 el(action).onclick=async()=>{
   const id=info.requestId;
   if(busy || !id || info.phase!=='requested')return;
   busy=true;el('error').textContent='';render();
   try{
     const r=await fetch('/desktop/'+action,{method:'POST',headers:{'x-qingclaw-request-id':id}});
     if(!r.ok && r.status!==409)throw Error();
   }catch{el('error').textContent=t.decisionFailed}
   finally{busy=false;await status()}
 }
}
el('copy').onclick=async()=>{try{await navigator.clipboard.writeText(info.link);copiedUntil=Date.now()+1500;render()}catch{el('link').select();el('copy').textContent=t.copyError}}
el('act').onclick=async()=>{if(busy)return;busy=true;render();try{const r=await fetch(info.paired?'/desktop/disconnect':'/desktop/refresh',{method:'POST'});if(!r.ok)throw Error()}catch{info={phase:'failed'}}finally{busy=false;await status()}}
status();
</script></body></html>`
}
