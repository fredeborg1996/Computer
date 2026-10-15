const types=[
  ['kloak og afvanding',/kloak|regnvand|spildevand|vandledning|dræn|brønd|rørled/i],
  ['asfalt',/asfalt|fræsning|fræsearbejd/i],
  ['belægning',/belæg|flise|kantsten|brosten|chauss/i],
  ['jordarbejde',/jord|udgrav|afgrav|muld|depon|terræn/i],
  ['beton',/beton|fundament|armer/i],
];
export function normalizedUnit(unit) {
  const u=String(unit||'').toLowerCase().replaceAll('²','2').replaceAll('³','3').replace(/[.\s]/g,'');
  if(['m','lbm','lm','lbnm'].includes(u))return 'm';
  if(['m2','m3','stk'].includes(u))return u;
  return null;
}
export function caseProfile(rows) {
  const categories=new Set(),measures=new Map(),byId=new Map(rows.map(r=>[r.id,r]));
  let measuredRows=0,unknownQuantity=0;
  for(const row of rows) {
    const matching=types.filter(([,pattern])=>pattern.test(row.text));
    matching.forEach(([type])=>categories.add(type));
    const unit=normalizedUnit(row.unit);
    if(!unit||!matching.length)continue;
    let qty=row.qty,parent=row.parentId,covered=false,seen=new Set([row.id]);
    if(!Number.isFinite(qty)||qty<=0){unknownQuantity++;continue;}
    while(parent) {
      if(seen.has(parent)||!byId.has(parent)){covered=true;unknownQuantity++;break;}
      seen.add(parent);const ancestor=byId.get(parent);
      // Resource quantities under an already measurable activity are not counted again.
      if(normalizedUnit(ancestor.unit)){covered=true;break;}
      if(!Number.isFinite(ancestor.qty)||ancestor.qty<=0){covered=true;unknownQuantity++;break;}
      qty*=ancestor.qty;parent=ancestor.parentId;
    }
    if(covered||!Number.isFinite(qty))continue;
    const key=matching[0][0]+'|'+unit;
    measures.set(key,(measures.get(key)||0)+qty);measuredRows++;
  }
  return {categories:[...categories],measures:[...measures].map(([key,quantity])=>{const [type,unit]=key.split('|');return {type,unit,quantity:Math.round(quantity*1000)/1000};}),measuredRows,unknownQuantity,access:'ukendt',outcome:'ukendt'};
}
export function compareProfiles(current,old) {
  const sharedTypes=current.categories.filter(t=>old.categories.includes(t));
  const union=new Set([...current.categories,...old.categories]);
  const typeScore=union.size?sharedTypes.length/union.size:null;
  const quantities=[];
  for(const q of current.measures) {
    const other=old.measures.find(m=>m.type===q.type&&m.unit===q.unit);
    if(!other||q.quantity<=0||other.quantity<=0)continue;
    const factor=Math.max(q.quantity,other.quantity)/Math.min(q.quantity,other.quantity);
    quantities.push({type:q.type,unit:q.unit,current:q.quantity,historical:other.quantity,factor:Math.round(factor*100)/100,score:1/(1+Math.abs(Math.log2(factor)))});
  }
  return {sharedTypes,typeScore,quantities,quantityScore:quantities.length?quantities.reduce((n,q)=>n+q.score,0)/quantities.length:null,
    conflict:!!(current.categories.length&&old.categories.length&&!sharedTypes.length),
    unknowns:[...(!quantities.length?['Mængderne kan ikke sammenlignes sikkert på samme enhedsgrundlag.']:[]),'Adgangsforhold, dato/prisniveau og faktisk udfald er ikke dokumenteret.']};
}
