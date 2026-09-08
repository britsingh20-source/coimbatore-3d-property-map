import baseWorker from "./main-performance.js";

const ORIGIN=env=>env.FRONTEND_ORIGIN||"https://britsingh20-source.github.io";
const cors=env=>({"access-control-allow-origin":ORIGIN(env),"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,authorization","cache-control":"no-store"});
const json=(data,status=200,env={})=>new Response(JSON.stringify(data),{status,headers:{...cors(env),"content-type":"application/json; charset=utf-8"}});
const bearer=request=>{const value=request.headers.get("authorization")||"";return value.startsWith("Bearer ")?value.slice(7):"";};
const clean=value=>String(value??"").trim();

async function internalSession(request,env){
  const token=bearer(request);if(!token)return null;
  const row=await env.DB.prepare("SELECT user_label,last_activity_at,active FROM telecaller_sessions WHERE token=? AND active=1").bind(token).first();
  if(!row)return null;
  await env.DB.prepare("UPDATE telecaller_sessions SET last_activity_at=CURRENT_TIMESTAMP WHERE token=?").bind(token).run();return row;
}
async function editorSession(request,env){const session=await internalSession(request,env);return session&&["Administrator","Director"].includes(session.user_label)?session:null;}
async function directorSession(request,env){const session=await editorSession(request,env);return session?.user_label==="Director"?session:null;}
function slug(value){return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"property";}
function parseCoordinates(value){
  const parts=clean(value).split(",").map(Number);if(parts.length!==2||!parts.every(Number.isFinite))return null;
  if(parts[0]>=8&&parts[0]<=13&&parts[1]>=75&&parts[1]<=80)return [parts[1],parts[0]];
  return parts;
}
function encodeBase64(buffer){const bytes=new Uint8Array(buffer);let result="";for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);}
function decodeBase64(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function storedBytes(value){
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  if(Array.isArray(value))return new Uint8Array(value);
  if(Array.isArray(value?.data))return new Uint8Array(value.data);
  return null;
}
function approximateCoordinates(property){
  let hash=0;for(const char of property.id)hash=(hash*31+char.charCodeAt(0))>>>0;
  const distance=950+(hash%101),bearing=(hash%360)*Math.PI/180,lat=Number(property.latitude),lng=Number(property.longitude);
  return [lng+(distance*Math.sin(bearing))/(111320*Math.max(.2,Math.cos(lat*Math.PI/180))),lat+(distance*Math.cos(bearing))/111320];
}
function publicAddress(value){
  const parts=clean(value).split(",").map(x=>x.trim()).filter(Boolean).filter(x=>!/^tamil nadu$/i.test(x)&&!/^india$/i.test(x)&&!/^coimbatore(?: district)?$/i.test(x));
  const area=parts.at(-1)||"Coimbatore";
  return `${area} area, Coimbatore`;
}
function coordinateDistanceMetres(a,b){
  const toRad=value=>value*Math.PI/180,lat1=toRad(a[1]),lat2=toRad(b[1]),dLat=lat2-lat1,dLng=toRad(b[0]-a[0]);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function instagramUrl(value){
  const raw=clean(value);if(!raw)return "";
  try{const url=new URL(raw);if(!/(^|\.)instagram\.com$/i.test(url.hostname)||!/^\/(reel|p)\/[^/]+\/?/.test(url.pathname))return null;return `https://www.instagram.com${url.pathname.replace(/\/+$/,"")}/`;}
  catch{return null;}
}
async function listProperties(env,exact=false){
  const properties=(await env.DB.prepare("SELECT * FROM properties WHERE active=1 ORDER BY updated_at DESC").all()).results||[];
  const images=(await env.DB.prepare("SELECT property_id,slot,object_key,original_name FROM property_images ORDER BY id").all()).results||[];
  return properties.map(p=>{
    const fallbackPublic=approximateCoordinates(p);
    const hasPublicCoordinates=p.public_longitude!==null&&p.public_longitude!==undefined&&p.public_latitude!==null&&p.public_latitude!==undefined&&Number.isFinite(Number(p.public_longitude))&&Number.isFinite(Number(p.public_latitude));
    const publicCoordinates=hasPublicCoordinates?[Number(p.public_longitude),Number(p.public_latitude)]:fallbackPublic;
    const shared={id:p.id,title:p.title,type:p.property_kind,bedrooms:p.bedrooms||"",price:p.price,landArea:p.land_area||"",builtUpArea:p.built_up_area||"",facing:p.facing||"",approval:p.approval||"",road:p.road||"",instagramUrl:p.instagram_url||"",features:JSON.parse(p.features_json||"[]"),tour:images.filter(i=>i.property_id===p.id).map(i=>({label:i.slot,url:`/api/property-media/${encodeURIComponent(i.object_key)}?v=2`,alt:i.original_name||`${i.slot} image`}))};
    if(!exact)return {...shared,address:clean(p.public_address)||publicAddress(p.address),coordinates:publicCoordinates,exactLocation:false,locationAccuracy:"approximate_1km"};
    return {...shared,address:p.address,coordinates:[p.longitude,p.latitude],exactLocation:true,locationAccuracy:"exact",publicAddress:clean(p.public_address)||publicAddress(p.address),publicCoordinates};
  });
}
async function saveProperty(request,env){
  const session=await editorSession(request,env);if(!session)return json({error:"Director or Administrator session required"},401,env);
  const form=await request.formData(),kind=clean(form.get("type"));
  if(!["Plot","Villa"].includes(kind))return json({error:"Property type must be Plot or Villa"},422,env);
  const title=clean(form.get("title")),address=clean(form.get("address")),price=clean(form.get("price")),coordinates=parseCoordinates(form.get("coordinates"));
  if(!title||!address||!price||!coordinates)return json({error:"Title, location, price and valid Longitude, Latitude are required"},422,env);
  const customerAddress=clean(form.get("publicAddress"))||publicAddress(address),requestedPublicCoordinates=parseCoordinates(form.get("publicCoordinates"));
  const generatedPublicCoordinates=approximateCoordinates({id:clean(form.get("id"))||title,longitude:coordinates[0],latitude:coordinates[1]});
  const publicCoordinates=requestedPublicCoordinates||generatedPublicCoordinates;
  if(clean(form.get("publicCoordinates"))&&!requestedPublicCoordinates)return json({error:"Customer map pin must contain valid Latitude, Longitude coordinates"},422,env);
  const publicDistance=coordinateDistanceMetres(coordinates,publicCoordinates);
  if(publicDistance<750||publicDistance>1500)return json({error:"Customer map pin must be 750 metres to 1.5 km from the exact site"},422,env);
  const socialVideo=instagramUrl(form.get("instagramUrl"));
  if(socialVideo===null)return json({error:"Instagram video must be a valid instagram.com/reel or instagram.com/p link"},422,env);
  const id=clean(form.get("id"))||`${slug(title)}-${Date.now().toString(36)}`;
  const existing=await env.DB.prepare("SELECT id FROM properties WHERE id=?").bind(id).first();
  const existingPoster=existing&&await env.DB.prepare("SELECT 1 ok FROM property_images WHERE property_id=? AND slot='Front Poster'").bind(id).first();
  const incomingPoster=form.get("image_Front Poster");
  if(!existingPoster&&(!(incomingPoster instanceof File)||!incomingPoster.size))return json({error:"A Front Poster image is required"},422,env);
  await env.DB.prepare(`INSERT INTO properties(id,title,property_kind,bedrooms,address,public_address,price,land_area,built_up_area,facing,approval,road,longitude,latitude,public_longitude,public_latitude,instagram_url,features_json,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,property_kind=excluded.property_kind,bedrooms=excluded.bedrooms,address=excluded.address,public_address=excluded.public_address,price=excluded.price,land_area=excluded.land_area,built_up_area=excluded.built_up_area,facing=excluded.facing,approval=excluded.approval,road=excluded.road,longitude=excluded.longitude,latitude=excluded.latitude,public_longitude=excluded.public_longitude,public_latitude=excluded.public_latitude,instagram_url=excluded.instagram_url,features_json=excluded.features_json,active=1,updated_at=CURRENT_TIMESTAMP`).bind(id,title,kind,clean(form.get("bedrooms"))||null,address,customerAddress,price,clean(form.get("landArea"))||null,clean(form.get("builtUpArea"))||null,clean(form.get("facing"))||null,clean(form.get("approval"))||null,clean(form.get("road"))||null,coordinates[0],coordinates[1],publicCoordinates[0],publicCoordinates[1],socialVideo||null,JSON.stringify(clean(form.get("features")).split(",").map(x=>x.trim()).filter(Boolean)),session.user_label).run();
  let uploaded=0;
  for(const [key,value] of form.entries()){
    if(!key.startsWith("image_")||!(value instanceof File)||!value.size)continue;
    if(value.size>1536*1024)return json({error:`${value.name} is too large after preparation`},422,env);
    if(!value.type.startsWith("image/"))return json({error:`${value.name} is not an image`},422,env);
    const slot=key.slice(6),old=await env.DB.prepare("SELECT object_key FROM property_images WHERE property_id=? AND slot=?").bind(id,slot).first();
    const ext=(value.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"").slice(0,5)||"jpg",objectKey=`${id}/${slug(slot)}-${crypto.randomUUID()}.${ext}`;
    const base64=encodeBase64(await value.arrayBuffer());
    await env.DB.prepare("INSERT INTO property_images(property_id,slot,object_key,image_data,image_base64,content_type,original_name) VALUES(?,?,?,NULL,?,?,?) ON CONFLICT(property_id,slot) DO UPDATE SET object_key=excluded.object_key,image_data=NULL,image_base64=excluded.image_base64,content_type=excluded.content_type,original_name=excluded.original_name,created_at=CURRENT_TIMESTAMP").bind(id,slot,objectKey,base64,value.type,value.name).run();
    uploaded++;
  }
  if(session.user_label==="Director"){
    for(const type of ["owner","manager","builder"]){
      const name=clean(form.get(`${type}_name`)),phone=clean(form.get(`${type}_phone`));
      if(phone)await env.DB.prepare("INSERT INTO property_contacts(property_id,contact_type,contact_name,contact_phone) VALUES(?,?,?,?) ON CONFLICT(property_id,contact_type) DO UPDATE SET contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,updated_at=CURRENT_TIMESTAMP").bind(id,type,name||null,phone).run();
      else await env.DB.prepare("DELETE FROM property_contacts WHERE property_id=? AND contact_type=?").bind(id,type).run();
    }
  }
  return json({ok:true,id,uploaded,property:(await listProperties(env)).find(p=>p.id===id)},200,env);
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,"")||"/";
  if(request.method==="OPTIONS"&&(path==="/api/properties"||path.startsWith("/api/properties/")||path.startsWith("/api/property-media/")))return new Response(null,{headers:cors(env)});
  if(request.method==="GET"&&path==="/api/properties")return json({properties:await listProperties(env,Boolean(await internalSession(request,env)))},200,env);
  const contactsMatch=path.match(/^\/api\/properties\/([^/]+)\/contacts$/);
  if(request.method==="GET"&&contactsMatch){
    if(!await directorSession(request,env))return json({error:"Director session required"},403,env);
    const contacts=(await env.DB.prepare("SELECT contact_type,contact_name,contact_phone FROM property_contacts WHERE property_id=? ORDER BY contact_type").bind(decodeURIComponent(contactsMatch[1])).all()).results||[];
    return json({contacts},200,env);
  }
  if(request.method==="POST"&&path==="/api/properties")return saveProperty(request,env);
  if(request.method==="GET"&&path.startsWith("/api/property-media/")){
    const key=decodeURIComponent(path.slice("/api/property-media/".length)),object=await env.DB.prepare("SELECT image_data,image_base64,content_type FROM property_images WHERE object_key=?").bind(key).first();
    const bytes=object?.image_base64?decodeBase64(object.image_base64):storedBytes(object?.image_data);if(!bytes?.byteLength)return new Response("Not found",{status:404,headers:cors(env)});
    const headers=new Headers(cors(env));headers.set("content-type",object.content_type||"image/jpeg");headers.set("content-length",String(bytes.byteLength));headers.set("cache-control","public,max-age=31536000,immutable");return new Response(bytes,{headers});
  }
  return baseWorker.fetch(request,env,ctx);
}};
