export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Метод не поддерживается'});
 try{
  const {image}=req.body||{};
  if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(image)||image.length>9000000)return res.status(400).json({error:'Нужно фото JPG/PNG/WEBP до 6 МБ'});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(503).json({error:'Добавьте GEMINI_API_KEY в настройках Vercel.'});
  const match=image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  const mime=match[1]==='jpeg'?'image/jpeg':'image/'+match[1];
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  let response;
  try{
   const modelsResponse=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':key},signal:controller.signal});
   if(!modelsResponse.ok)return res.status(502).json({error:'Не удалось получить список моделей Gemini ('+modelsResponse.status+').'});
   const models=await modelsResponse.json();
   const available=(models.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name);
   const candidates=['models/gemini-2.5-flash-lite','models/gemini-2.5-flash','models/gemini-2.0-flash','models/gemini-flash-latest',...available.filter(n=>n.startsWith('models/gemini-')&&n.includes('flash'))].filter((n,i,a)=>available.includes(n)&&a.indexOf(n)===i);
   if(!candidates.length)return res.status(502).json({error:'Gemini не предоставил доступных Flash-моделей для этого ключа.'});
   let lastError='';
   for(const model of candidates.slice(0,5)){
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/'+model+':generateContent',{
     method:'POST',signal:controller.signal,
     headers:{'Content-Type':'application/json','x-goog-api-key':key},
     body:JSON.stringify({contents:[{role:'user',parts:[
      {text:'На русском в 2–4 предложениях опиши только видимую линию роста волос и видимость кожи головы. Не ставь диагноз, не определяй стадию облысения и не рекомендуй лечение.'},
      {inline_data:{mime_type:mime,data:match[2]}}
     ]}],generationConfig:{maxOutputTokens:350,temperature:0.2}})
    });
    if(response.ok)break;
    const err=await response.json().catch(()=>({}));
    lastError=String(err?.error?.message||'').slice(0,180);
    if(response.status!==404)break;
   }
   if(!response.ok && response.status===404)return res.status(502).json({error:'Google не разрешает генерацию выбранными моделями (404). '+lastError.replace(/AIza[\\w-]+/g,'[скрыто]')});
  }finally{clearTimeout(timer)}
  if(!response.ok){
   const err=await response.json().catch(()=>({}));
   const msg=response.status===404?'Выбранная модель Gemini недоступна для этого ключа.':response.status===429?'Бесплатный лимит Gemini исчерпан. Попробуйте позже.':response.status===403?'Gemini API недоступен для этого проекта или региона.':response.status===400?'Gemini отклонил запрос или ключ.': 'Сервис Gemini временно недоступен ('+response.status+').';
   return res.status(502).json({error:msg});
  }
  const data=await response.json();
  const result=(data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(' ').trim();
  if(!result)return res.status(502).json({error:'Модель не вернула описание изображения.'});
  return res.status(200).json({result:result.slice(0,1500)});
 }catch(e){return res.status(500).json({error:e?.name==='AbortError'?'Анализ занял слишком много времени.':'Не удалось обработать фото.'})}
}