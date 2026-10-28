// Stand-in for the `pg` package in the Cloudflare Worker build (see
// next.config.ts). Production talks to Supabase only.
export class Pool {
  constructor() {
    throw new Error("pg is not available in the Worker build");
  }
}
const pg = { Pool };
export default pg;
