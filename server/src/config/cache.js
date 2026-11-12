import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 30,
  checkperiod: 30,
  maxKeys: 5000,
  useClones: false,
});

export default cache;
