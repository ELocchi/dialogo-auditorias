"use client";
import { useFollowUpPhotoStore,useFollowUpVisitPhotos } from "@/app/components/use-follow-up-photos";
const id=(n:number)=>`a1000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function Row({store,n}:{store:ReturnType<typeof useFollowUpPhotoStore>;n:number}) {
  const {ref,status,retry}=useFollowUpVisitPhotos(store,id(n+10));
  return <li ref={ref} style={{lineHeight:"18px"}} data-status={status}>Visita fictícia {n+1}: {status}
    {status==="error"&&<button onClick={retry}>Tentar novamente</button>}</li>;
}
export default function Review(){
 const store=useFollowUpPhotoStore({userId:id(1),profile:"AUDITOR_QUALIDADE",engineeringScope:null,administrativeScope:null});
 return <main><h1>Validação N+1 — dados fictícios</h1><p>42 visitas visíveis. Nenhuma gravação.</p>
   <ul style={{padding:0,margin:0}}>{Array.from({length:42},(_,n)=><Row key={n} n={n} store={store}/>)}</ul></main>;
}
