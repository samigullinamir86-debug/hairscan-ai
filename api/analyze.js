export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Метод не поддерживается'});
 try{
  const {image}=req.body||{};
  if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(image)||image.length>9000000)return res.status(400).json({error:'Нужно фото JPG/PNG/WEBP до 6 МБ'});
  const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  if(!token)return res.status(503).json({error:'Сервис анализа пока не настроен: отсутствует авторизация AI Gateway'});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  let response;
  try{response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
   method:'POST',signal:controller.signal,
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
   body:JSON.stringify({model:'alibaba/qwen3-vl-235b-a22b-instruct',max_tokens:220,temperature:0.1,
    messages:[{role:'system',content:'Ты помощник по визуальному описанию линии роста волос, не врач. Не ставь диагноз, не утверждай облысение. Ответь на русском 2-4 короткими предложениями: видимость линии роста, возможные видимые изменения, ограничения одного снимка. Если фото нечёткое, скажи это. Не назначай лечение. Не угадывай возраст и другие личные характеристики.'},{role:'user',content:[{type:'text',text:'Опиши видимые особенности линии роста волос на этом фото. Это не медицинская диагностика.'},{type:'image_url',image_url:{url:image}}]}]})
   });}finally{clearTimeout(timer)}
  if(!response.ok){const err=await response.json().catch(()=>({}));return res.status(502).json({error:response.status===402?'На AI Gateway закончились средства.':response.status===403?'Нужно подтвердить платёжный метод в Vercel AI Gateway.':'AI-сервис временно недоступен ('+response.status+').',detail:err?.error?.code||null})}
  const data=await response.json();const result=data?.choices?.[0]?.message?.content;
  if(typeof result!=='string'||!result.trim())return res.status(502).json({error:'Модель не вернула результат'});
  return res.status(200).json({result:result.slice(0,1500)});
 }catch(e){return res.status(500).json({error:e?.name==='AbortError'?'Анализ занял слишком много времени.':'Не удалось обработать фото.'})}
}