import { aggregate, CART_LIFETIME, validQuantity, type CartRecord } from '@/domain/commerce';
import { getProduct } from '@/domain/catalog';

let connection: Promise<IDBDatabase> | undefined;
const fresh = (): CartRecord => ({ version: 1, generation: crypto.randomUUID(), revision: 0, lastActivity: Date.now(), batches: [], consumedOrders: [] });
function validRecord(value: unknown): value is CartRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as CartRecord;
  if (record.version !== 1 || typeof record.generation !== 'string' || !record.generation || !Number.isSafeInteger(record.revision) || record.revision < 0 || !Number.isFinite(record.lastActivity) || !Array.isArray(record.batches) || !Array.isArray(record.consumedOrders)) return false;
  if (!record.batches.every(batch => batch && typeof batch.id === 'string' && !!batch.id && Boolean(getProduct(batch.slug)) && validQuantity(batch.quantity))
    || new Set(record.batches.map(batch => batch.id)).size !== record.batches.length
    || !record.consumedOrders.every(id => typeof id === 'string' && !!id)) return false;
  // Persist quantities, not a price snapshot: changing catalogue prices must not discard a cart.
  const grouped = aggregate(record.batches);
  if (grouped.some(item => !validQuantity(item.quantity)) || grouped.reduce((total,item) => total + BigInt(item.quantity),0n) > BigInt(Number.MAX_SAFE_INTEGER)) return false;
  return true;
}
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('thunder-fang-cart', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('cart');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(new Error('Não foi possível acessar o carrinho neste navegador.')); };
    request.onblocked = () => { connection = undefined; reject(new Error('Feche as guias antigas para atualizar o carrinho.')); };
  });
  return connection;
}
export async function transactCart(change?: (record: CartRecord) => CartRecord) {
  const db = await database();
  return new Promise<{ record: CartRecord; expired: boolean; recovered: boolean }>((resolve, reject) => {
    const tx = db.transaction('cart', 'readwrite');
    const store = tx.objectStore('cart');
    let result: CartRecord; let expired = false; let recovered = false;
    const read = store.get('current');
    read.onsuccess = () => {
      try {
        const stored: unknown = read.result;
        const valid = validRecord(stored);
        recovered = stored !== undefined && !valid;
        expired = valid && Boolean(stored.batches.length && Date.now() - stored.lastActivity >= CART_LIFETIME);
        const previous = valid && !expired ? stored : fresh();
        result = change ? change(previous) : previous;
        store.put(result, 'current');
      } catch (error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => resolve({ record: result, expired, recovered });
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao atualizar o carrinho.'));
    tx.onabort = () => reject(tx.error ?? new Error('Falha ao atualizar o carrinho.'));
  });
}
