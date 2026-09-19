// Runs the real UI components and draft hook without credentials or external writes.
// Network/storage boundaries are stubbed; assertions cover browser state and request payloads.
import path from 'node:path';
import { createRequire } from 'node:module';

export async function buildStudioLocationHarness(): Promise<string> {
  const root = process.env.JASS_UI_PATH || path.resolve(__dirname, '../../../jasstickets-ui');
  const uiRequire = createRequire(path.join(root, 'package.json'));
  const esbuild = uiRequire('esbuild');
  const result = await esbuild.build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import LocationSheet from './app/(client)/components/studio/event-canvas/LocationSheet';
      import {useEventDraft} from './app/(client)/components/studio/event-canvas/useEventDraft';
      window.requests=[];
      window.failPlace=false;
      window.fetch=async (url, options) => {
        if(url.startsWith('/api/places-autocomplete')) return new Response(JSON.stringify({suggestions:[{placePrediction:{placeId:'test',text:{text:'Toronto venue'}}}]}));
        if(url.startsWith('/api/places-details')) {
          if(window.failPlace) throw Error('offline');
          return new Response(JSON.stringify({formattedAddress:'123 King Street',addressComponents:[
            {types:['country'],longText:'Canada',shortText:'CA'},
            {types:['locality'],longText:'Toronto'},
            {types:['postal_code'],longText:'M5V 1J2'}
          ]}));
        }
        window.requests.push({url, payload:JSON.parse(options.body.get('request'))});
        return new Response(JSON.stringify(url.endsWith('/draft') ? {Id:'draft-id'} : {Event:{Id:'event-id',IsVisible:true}}));
      };
      const empty={address:'',city:'',zipCode:'',venueName:'',stateProvince:'',countryIso:''};
      function App(){
        const [location,setLocation]=useState(empty);
        const [open,setOpen]=useState(true);
        const [external,setExternal]=useState(false);
        const draft=useEventDraft('organizer-id');
        window.qa={location, draft, reset:(next={}, allowExternal=false)=>{setLocation({...empty,...next});setExternal(allowExternal);setOpen(true)}, reopen:()=>setOpen(true)};
        return <LocationSheet allowUnlistedCountry={external} open={open} value={location} onClose={()=>setOpen(false)} onApply={next=>{setLocation(next);draft.patch(next)}}/>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `},
    bundle:true, write:false, platform:'browser', loader:{'.css':'empty'},
    plugins:[{name:'test-boundaries',setup(build){
      build.onResolve({filter:/react-i18next|eventCreationImageUpload|eventDescriptionImageUpload|SpotifyTrackInput|utils\/analytics/},args=>({path:args.path,namespace:'stub'}));
      build.onLoad({filter:/.*/,namespace:'stub'},args=>{
        if(args.path==='react-i18next') return {contents:`import studio from '${root}/public/locales/en/studio.json'; import ui from '${root}/public/locales/en/ui-components.json'; export const useTranslation=(ns)=>({t:(key)=>key.split('.').reduce((v,k)=>v?.[k],ns==='ui-components'?ui:studio)??key});`,loader:'js',resolveDir:root};
        if(args.path.includes('eventCreationImageUpload')) return {contents:`export const uploadEventCreationMainImage=async()=>({imageUrl:'https://test.invalid/main.jpg',thumbnailUrl:'https://test.invalid/thumb.jpg'}); export const uploadEventCreationGalleryImage=async()=>'';`};
        if(args.path.includes('eventDescriptionImageUpload')) return {contents:`export const uploadEmbeddedEventDescriptionImages=async(id,html)=>html;`};
        if(args.path.includes('SpotifyTrackInput')) return {contents:`export const convertToEmbedUrl=x=>x;`};
        return {contents:`export const trackEventCreated=()=>{};`};
      });
    }}]
  });
  return result.outputFiles[0].text;
}
