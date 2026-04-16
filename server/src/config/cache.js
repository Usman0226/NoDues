import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 10,           
  checkperiod: 60,      
  useClones: false,     
});

export default cache;