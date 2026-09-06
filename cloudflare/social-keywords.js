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

const compact = value => String(value || '').toUpperCase().replace(/[^A-Z]/g,'');

export function detectSocialKeyword(text=''){
  const normalized = compact(text);
  if(!normalized) return null;
  for(const [keyword,area,assignedTo] of SOCIAL_KEYWORDS){
    if(normalized.includes(compact(keyword))) return {keyword,area,assignedTo};
  }
  return null;
}
