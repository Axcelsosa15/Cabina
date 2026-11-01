/* Optional guide and device-local break reminders. No requests or notifications. */
(function(root){
  'use strict';
  const GUIDE_KEY='cabina:guia:v1', FOCUS_KEY='cabina:guia:checklist', BREAK_PREFIX='cabina:pausas:v1:';
  let api=null, guideStep=0, guideBusy=false, guideReturn=null, guideReturnId=null, guideGeneration=0, guideOverflow='';
  let breakState=null, breakKey=null, preferenceSeen=false, lastSaved='', lastSavedAt=0, storageAvailable=true, breakReturn=null;
  const memory=new Map(), $=id=>document.getElementById(id);
  const context=()=>api.context();
  const txt=(es,en)=>context().language==='en'?en:es;
  const put=(id,value)=>{const e=$(id);if(e&&e.textContent!==value)e.textContent=value;};
  const isGuideOpen=()=>$('guideOv')?.classList.contains('open')===true;
  function guideCompleted(){try{return localStorage.getItem(GUIDE_KEY)==='1';}catch(e){return false;}}
  function renderGuide(){
    const c=context(), count=Number(c.checkCount)||0;
    put('guideOpen',guideCompleted()?txt('Repetir guía · 2 min','Repeat guide · 2 min'):txt('Guía inicial · 2 min','Quick guide · 2 min'));
    put('guideWelcome',txt('Guía · 2 min','Guide · 2 min'));
    put('guideClose',txt('Cerrar','Close')); put('guideBack',txt('Volver','Back'));
    put('guideNext',txt('Continuar','Continue')); put('guideFinish',txt('Ir a mi checklist','Go to my checklist'));
    put('guideDemo',c.demo?txt('Seguir con ejemplos','Continue with examples'):txt('Explorar con ejemplos','Explore with examples'));
    put('guideReal',txt('Continuar con mis registros','Continue with my records'));
    put('guideLanguage',c.language==='en'?'ES':'EN');
    $('guideLanguage').setAttribute('aria-label',txt('Cambiar idioma a inglés','Switch language to Spanish'));
    put('guideProgress',txt(`Guía de 2 minutos · ${guideStep+1} de 3`,`Two-minute guide · ${guideStep+1} of 3`));
    const titles=[txt('Conoce tu Cabina','Meet your Cabina'),txt('Prepara antes de entrar','Prepare before entering'),txt('Registra y aprende del proceso','Record and learn from your process')];
    put('guideTitle',titles[guideStep]);
    const body=[
      txt('<p>Prepara el día, registra lo ocurrido y revisa tus hábitos. Puedes explorar con ejemplos o usar tus registros.</p><p class="experience-demo-note">Los ejemplos son inventados. Al terminar vuelves a tus datos reales; la guía no crea cuentas ni operaciones.</p>','<p>Prepare your day, record what happened and review your habits. Explore examples or use your records.</p><p class="experience-demo-note">Examples are invented. Finishing returns to your real records; the guide creates no accounts or trades.</p>'),
      txt(`<p>Tu checklist tiene <strong>${count} pasos</strong> configurados. Revísalos y guarda la pre-sesión antes de entrar.</p><p>Comprueba tu cuenta, horario, stop y límites. Si no hay edge, puedes decidir no operar. Los límites de una firma deben verificarse en su sitio oficial y en tu contrato.</p>`,`<p>Your checklist has <strong>${count} configured steps</strong>. Review them and save your pre-session before entering.</p><p>Check your account, trading window, stop and limits. If there is no edge, you can choose not to trade. Firm limits must be checked on its official site and in your agreement.</p>`),
      txt('<p>El diario guarda lo que ocurrió, incluidos los errores. Cierra el día con una reflexión; no necesitas registrar una operación para completar esta guía.</p><p>Disciplina muestra la evidencia disponible, las rachas de preparación y el recap semanal. Ganar dinero u operar más no suma XP.</p><p class="experience-demo-note">Cabina es una herramienta de registro y análisis, no asesoría financiera.</p>','<p>The journal records what happened, including mistakes. Close the day with a reflection; no trade is needed to complete this guide.</p><p>Discipline shows available evidence, preparation streaks and your weekly recap. Making money or trading more earns no XP.</p><p class="experience-demo-note">Cabina is a recording and analysis tool, not financial advice.</p>')
    ];
    if($('guideBody').innerHTML!==body[guideStep])$('guideBody').innerHTML=body[guideStep];
    $('guideChoices').hidden=guideStep!==0; $('guideReal').hidden=!!c.demo;
    $('guideBack').hidden=guideStep===0;
    $('guideFooter').hidden=guideStep===0;
    $('guideNext').hidden=guideStep!==1;
    $('guideFinish').hidden=guideStep!==2;
    for(const id of ['guideDemo','guideReal','guideBack','guideNext','guideFinish'])$(id).disabled=guideBusy;
  }
  function openGuide(){
    if(isGuideOpen())return;
    guideGeneration++; guideStep=0; guideBusy=false; guideReturn=document.activeElement;guideReturnId=guideReturn?.id||null;
    guideOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    put('guideStatus','');renderGuide();$('guideOv').classList.add('open');$('guideTitle').focus();renderBreak();
  }
  function closeGuide(restore=true){
    if(!isGuideOpen())return;
    guideGeneration++; $('guideOv').classList.remove('open');document.body.style.overflow=guideOverflow;
    if(restore){
      const candidates=[guideReturn?.isConnected?guideReturn:guideReturnId?$(guideReturnId):null,context().demo?$('demoExit'):null,$('quickBtn'),$('guideOpen')];
      const target=candidates.find(e=>e&&!e.disabled&&e.getClientRects().length);target?.focus();
    }
    guideReturn=null;guideReturnId=null;renderBreak();
  }
  function nextGuide(step){guideStep=step;put('guideStatus','');renderGuide();$('guideTitle').focus();}
  async function guideDemo(){
    const generation=guideGeneration;
    guideBusy=true;renderGuide();put('guideStatus',txt('Terminando cualquier guardado pendiente…','Finishing any pending saves…'));
    try{const entered=await api.enterDemo(()=>isGuideOpen()&&generation===guideGeneration);if(generation!==guideGeneration)return;if(entered===false){put('guideStatus',txt('Resuelve el guardado pendiente antes de explorar los ejemplos.','Resolve the pending save before exploring examples.'));return;}nextGuide(1);}
    catch(e){put('guideStatus',txt('No se pudo abrir la demo. Tus registros se conservan.','Could not open the demo. Your records are preserved.'));}
    finally{if(generation===guideGeneration){guideBusy=false;renderGuide();}}
  }
  function finishGuide(){
    try{localStorage.setItem(GUIDE_KEY,'1');}catch(e){}
    const demo=context().demo;closeGuide(false);renderGuide();
    if(demo){try{sessionStorage.setItem(FOCUS_KEY,'1');}catch(e){}api.exitDemoToChecklist();}
    else api.openChecklist();
  }
  function record(s){return{version:s.version,enabled:s.enabled,limitMinutes:s.limitMinutes,elapsedMs:s.elapsedMs,date:s.date,dismissed:s.dismissed};}
  function saveBreak(force=false){
    if(!breakState||!breakKey||!preferenceSeen)return;
    const value=record(breakState), json=JSON.stringify(value);memory.set(breakKey,value);
    if(json===lastSaved)return;
    if(!force&&Date.now()-lastSavedAt<15000)return;
    try{localStorage.setItem(breakKey,json);storageAvailable=true;lastSaved=json;lastSavedAt=Date.now();}
    catch(e){storageAvailable=false;lastSavedAt=Date.now();}
  }
  function selectOwner(c){
    const key=BREAK_PREFIX+String(c.owner||'local');if(breakKey===key)return;
    if(breakState){breakState=root.CabinaBreakClock.step(breakState,{now:Date.now(),active:false,date:breakState.date||c.today});saveBreak(true);}
    breakKey=key;let raw=memory.get(key), stored=null;
    try{stored=localStorage.getItem(key);if(!raw&&stored)raw=JSON.parse(stored);storageAvailable=true;}catch(e){storageAvailable=false;}
    preferenceSeen=!!raw;breakState=root.CabinaBreakClock.create(raw);
    breakState=root.CabinaBreakClock.step(breakState,{now:Date.now(),active:false,date:c.today});
    lastSaved=stored||'';lastSavedAt=Date.now();breakReturn=null;
  }
  function clockContext(c){return{now:Date.now(),date:c.today,active:!!c.ready&&!c.demo&&document.visibilityState==='visible'&&document.hasFocus()};}
  function tick(force=false){
    if(!api||!root.CabinaBreakClock)return;
    const c=context();selectOwner(c);breakState=root.CabinaBreakClock.step(breakState,clockContext(c));saveBreak(force);renderBreak();
  }
  function renderBreak(){
    if(!api||!breakState)return;
    const c=context(), s=breakState, minutes=Math.floor(s.elapsedMs/60000);
    put('breakTitle',txt('Pausas a tu ritmo','Breaks at your pace'));
    put('breakDescription',txt('Recordatorio opcional dentro de Cabina. Sólo cuenta el tiempo con esta pestaña visible y activa; se guarda en este navegador.','An optional reminder inside Cabina. It counts only time with this tab visible and focused, stored in this browser.'));
    put('breakEnabledLabel',txt('Activar recordatorio de descanso','Enable a break reminder'));
    put('breakLimitLabel',txt('Recordarme una pausa tras','Remind me to pause after'));
    put('breakPrivacy',txt('Sin permisos de notificaciones, sonidos ni puntos por permanecer conectado. Apagarlo elimina el tiempo contado hoy.','No notification permissions, sounds or points for staying connected. Turning it off clears today’s recorded time.'));
    $('breakEnabled').checked=s.enabled;$('breakEnabled').disabled=!!c.demo;
    $('breakLimit').value=String(s.limitMinutes);$('breakLimit').disabled=!!c.demo;
    let status=c.demo?txt('Demo: el recordatorio está pausado y conserva tu configuración real.','Demo: the break reminder is paused and preserves your real settings.')
      :!s.enabled?txt('Desactivado. No se mide tiempo ni se muestran avisos.','Disabled. No time is measured and no reminders are shown.')
      :s.dismissed?txt(`Aviso descartado por hoy · ${minutes} minutos registrados.`,`Reminder dismissed for today · ${minutes} minutes recorded.`)
      :txt(`Uso activo hoy: ${minutes}/${s.limitMinutes} minutos. Cambiar de pestaña o ventana pausa el contador.`,`Active use today: ${minutes}/${s.limitMinutes} minutes. Switching tabs or windows pauses the timer.`);
    if(!storageAvailable)status+=' '+txt('No se pudo guardar: esta preferencia durará sólo esta visita.','Could not save: this preference lasts only for this visit.');
    put('breakStatus',status);
    put('breakNoticeTitle',txt('Un momento para descansar','A moment to rest'));
    put('breakNoticeText',txt(`Alcanzaste tu recordatorio de ${s.limitMinutes} minutos de uso activo. Considera hacer una pausa.`,`You reached your ${s.limitMinutes}-minute active-use reminder. Consider taking a break.`));
    put('breakDismiss',txt('Entendido por hoy','Dismiss for today'));put('breakDisable',txt('Apagar recordatorio','Turn off reminder'));
    const show=s.shouldRemind&&!c.demo&&c.ready&&document.visibilityState==='visible'&&document.hasFocus()&&!document.querySelector('.ov.open');
    if(show&&$('breakNotice').hidden){const focus=document.activeElement;if(focus&&!$('breakNotice').contains(focus))breakReturn=focus;}
    $('breakNotice').hidden=!show;
  }
  function restoreAfterNotice(){const target=breakReturn?.isConnected&&breakReturn.getClientRects().length?breakReturn:$('quickBtn');if(target)target.focus();breakReturn=null;}
  function refresh(){if(!api)return;tick(false);renderGuide();}
  function mount(hooks){
    if(api)return;api=hooks;
    for(const id of ['guideOpen','guideWelcome'])$(id).addEventListener('click',openGuide);
    $('guideClose').addEventListener('click',()=>closeGuide());
    $('guideLanguage').addEventListener('click',()=>{api.toggleLanguage();refresh();});
    $('guideDemo').addEventListener('click',guideDemo);$('guideReal').addEventListener('click',()=>nextGuide(1));
    $('guideBack').addEventListener('click',()=>nextGuide(Math.max(0,guideStep-1)));
    $('guideNext').addEventListener('click',()=>nextGuide(2));$('guideFinish').addEventListener('click',finishGuide);
    $('guideOv').addEventListener('click',e=>{if(e.target===$('guideOv'))closeGuide();});
    $('guideOv').addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeGuide();}
      if(e.key==='Tab'){
        const items=Array.from($('guideOv').querySelectorAll('button:not([disabled])')).filter(x=>x.getClientRects().length),first=items[0],last=items[items.length-1];
        if(e.shiftKey&&(document.activeElement===first||!items.includes(document.activeElement))){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!items.includes(document.activeElement))){e.preventDefault();first?.focus();}
      }
    });
    $('breakEnabled').addEventListener('change',()=>{const enabled=$('breakEnabled').checked;tick();if(context().demo)return;preferenceSeen=true;breakState=root.CabinaBreakClock.setEnabled(breakState,enabled,clockContext(context()));saveBreak(true);renderBreak();});
    $('breakLimit').addEventListener('change',()=>{const limit=Number($('breakLimit').value);tick();if(context().demo)return;preferenceSeen=true;breakState=root.CabinaBreakClock.setLimit(breakState,limit);saveBreak(true);renderBreak();});
    $('breakDismiss').addEventListener('click',()=>{tick();breakState=root.CabinaBreakClock.dismiss(breakState);saveBreak(true);renderBreak();restoreAfterNotice();});
    $('breakDisable').addEventListener('click',()=>{breakState=root.CabinaBreakClock.setEnabled(breakState,false,clockContext(context()));preferenceSeen=true;saveBreak(true);renderBreak();restoreAfterNotice();});
    document.addEventListener('visibilitychange',()=>tick(true));window.addEventListener('blur',()=>tick(true));window.addEventListener('focus',()=>tick());window.addEventListener('pagehide',()=>tick(true));
    // Focus permits one foreground tab to own the timer. Other tabs only reload
    // its aggregate; no background page can add a second interval.
    window.addEventListener('storage',e=>{if(e.key!==breakKey)return;try{const raw=e.newValue?JSON.parse(e.newValue):null;breakState=root.CabinaBreakClock.create(raw);if(raw)memory.set(breakKey,record(breakState));else memory.delete(breakKey);lastSaved=e.newValue||'';preferenceSeen=!!raw;renderBreak();}catch(err){}});
    setInterval(()=>tick(),1000);refresh();
    try{if(sessionStorage.getItem(FOCUS_KEY)==='1'){sessionStorage.removeItem(FOCUS_KEY);api.openChecklist();}}catch(e){}
  }
  root.CabinaExperience=Object.freeze({mount,refresh,isGuideOpen,closeGuide});
})(typeof globalThis!=='undefined'?globalThis:window);
