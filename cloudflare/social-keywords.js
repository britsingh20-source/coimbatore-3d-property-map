export const SOCIAL_KEYWORDS = [
  ['KARAMADAI','Karamadai','Telecaller 2'],
  ['KARAMADI','Karamadai','Telecaller 2'],
  ['SARAVANAMPATTI','Saravanampatti','Telecaller 1'],
  ['SARANAMPATTI','Saravanampatti','Telecaller 1'],
  ['KALAPATTI','Kalapatti','Telecaller 1'],
  ['VADAVALLI','Vadavalli','Telecaller 2'],
  ['SULUR','Sulur','Telecaller 1'],
  ['KOVILPALAYAM','Kovilpalayam','Telecaller 2'],
  ['ANNUR','Annur','Telecaller 2'],
  ['METTUPALAYAM','Mettupalayam','Telecaller 2'],
  ['MALUMICHAMPATTI','Malumichampatti','Telecaller 1']
];

export const AREA_OPTIONS = [
  ['KALAPATTI','Kalapatti','Telecaller 1'],
  ['SARAVANAMPATTI','Saravanampatti','Telecaller 1'],
  ['VADAVALLI','Vadavalli','Telecaller 2'],
  ['SULUR','Sulur','Telecaller 1'],
  ['KARAMADAI','Karamadai','Telecaller 2'],
  ['KOVILPALAYAM','Kovilpalayam','Telecaller 2'],
  ['ANNUR','Annur','Telecaller 2'],
  ['METTUPALAYAM','Mettupalayam','Telecaller 2'],
  ['MALUMICHAMPATTI','Malumichampatti','Telecaller 1']
];

const compact = value => String(value || '').toUpperCase().replace(/[^A-Z]/g,'');
const words = value => String(value || '').toUpperCase().replace(/[^A-Z]+/g,' ').trim().split(/\s+/).filter(Boolean);

export function detectAreaIntent(text=''){
  const tokens=words(text);
  if(tokens.includes('AREA')) return {keyword:'AREA',area:null,assignedTo:null,intent:'area_menu'};
  const normalized=compact(text);
  if(normalized==='AREA'||normalized==='AREAPLEASE'||normalized==='PLEASEAREA'||normalized==='SENDAREA'||normalized==='AREAS'){
    return {keyword:'AREA',area:null,assignedTo:null,intent:'area_menu'};
  }
  return null;
}

export function areaByPayload(payload=''){
  const value=String(payload||'').toUpperCase().replace(/^AREA[:_\-]/,'');
  for(const [keyword,area,assignedTo] of AREA_OPTIONS){
    if(value===keyword) return {keyword,area,assignedTo};
  }
  return null;
}

export function detectSocialKeyword(text=''){
  const areaIntent=detectAreaIntent(text);
  if(areaIntent)return areaIntent;
  const normalized = compact(text);
  if(!normalized) return null;
  for(const [keyword,area,assignedTo] of SOCIAL_KEYWORDS){
    if(normalized.includes(compact(keyword))) return {keyword,area,assignedTo,intent:'locality'};
  }
  return null;
}
