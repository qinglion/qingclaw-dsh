export function desktopPairingPage(locale: 'zh' | 'en'): string {
  const zh = locale === 'zh'
  const strings = zh
    ? {
      title: '连接移动设备',
      hint: '用手机扫码，使用与电脑相同的微信账号登录。手机申请连接后，在此确认。',
      loading: '正在连接青狮官网…',
      waiting: '等待手机配对',
      reconnecting: '正在重新连接官网…',
      connected: '手机已连接',
      away: '已配对，手机暂离',
      awayHint: '在手机上重新打开配对页面即可恢复连接。',
      connectedHint: '可以关闭此窗口。断开后，手机需要重新扫码。',
      requested: '手机请求连接',
      denied: '已拒绝本次申请',
      requestHint: '同意后，这部手机可以查看此电脑的会话并发送消息。',
      approve: '同意连接',
      deny: '拒绝',
      decisionFailed: '操作未完成，请重试。',
      expires: '二维码剩余',
      seconds: '秒',
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
      title: 'Connect mobile device',
      hint: 'Scan with your phone and sign in to the same WeChat account. Confirm the connection here.',
      loading: 'Connecting to QingClaw…',
      waiting: 'Waiting for your phone',
      reconnecting: 'Reconnecting to QingClaw…',
      connected: 'Phone connected',
      away: 'Paired · Phone offline',
      awayHint: 'Reopen the pairing page on your phone to reconnect.',
      connectedHint: 'You can close this window. After disconnecting, scan a new code to pair again.',
      requested: 'A phone is requesting access',
      denied: 'Connection request denied',
      requestHint: 'Allow this phone to view conversations on this computer and send messages.',
      approve: 'Allow connection',
      deny: 'Deny',
      decisionFailed: 'Could not complete your request. Try again.',
      expires: 'QR code expires in',
      seconds: 's',
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
<title>${strings.title}</title><style>
:root{color-scheme:light dark;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;background:Canvas;color:CanvasText}main{max-width:370px;margin:auto;padding:28px 24px;text-align:center}
h1{font-size:24px;margin:8px 0 16px}p{line-height:1.55}#hint,#timer{opacity:.72}#state{font-weight:600}#qr{width:204px;max-width:90%;margin:5px auto;display:block;background:#fff;border:10px solid #fff;border-radius:10px}
#link{display:block;box-sizing:border-box;width:100%;background:transparent;border:0;color:inherit;text-align:center;text-overflow:ellipsis}
button{font:inherit;padding:9px 14px;border:1px solid color-mix(in srgb,CanvasText 22%,transparent);border-radius:8px;background:ButtonFace;color:ButtonText;cursor:pointer}button:focus-visible{outline:2px solid Highlight}#actions{display:flex;justify-content:center;gap:8px}button:disabled{opacity:.6}#panel[hidden],[hidden]{display:none!important}
</style></head><body><main><h1>${strings.title}</h1><p id="state" role="status"></p><p id="hint"></p>
<section id="panel" hidden><img id="qr" alt="QR"><p id="timer"></p><input id="link" readonly aria-label="${strings.copy}"></section>
<p id="error" role="alert"></p><div id="actions"><button id="approve" hidden type="button">${strings.approve}</button><button id="deny" hidden type="button">${strings.deny}</button><button id="copy" hidden type="button">${strings.copy}</button><button id="act" hidden type="button"></button></div></main>
<script>
const t=${JSON.stringify(strings)}, el=id=>document.getElementById(id);
let info={}, busy=false, poll=null, copiedUntil=0;
function render(){
 const paired=info.paired, pending=Boolean(info.requestId && info.phase==='requested'), show=Boolean(info.qr && info.phase==='waiting');
 el('state').textContent=t[info.phase] || t.loading;
 el('hint').textContent=pending?t.requestHint:info.phase==='away'?t.awayHint:info.phase==='connected'?t.connectedHint:show?t.hint:'';
 el('panel').hidden=!show;el('copy').hidden=!show;
 el('copy').textContent=Date.now()<copiedUntil?t.copied:t.copy;
 if(show){
   if(el('qr').getAttribute('src')!==info.qr)el('qr').src=info.qr;
   el('link').value=info.link;
   el('timer').textContent=t.expires+' '+Math.max(0,Math.ceil((info.pairingExpiresAt-Date.now())/1000))+' '+t.seconds;
 }else{el('qr').removeAttribute('src');el('link').value='';}
 for(const id of ['approve','deny']){el(id).hidden=!pending;el(id).disabled=busy;}
 el('act').hidden=pending || info.phase==='loading';el('act').disabled=busy;
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
