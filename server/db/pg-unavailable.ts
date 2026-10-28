// Stand-in for the `pg` package in the Cloudflare Worker build (see
// next.config.ts). Production talks to Supabase only.
const unavailable = () => {
  throw new Error("pg is not available in the Worker build");
};
export class Pool {
  constructor() {
    unavailable();
  }
}
const pg = { Pool };
export default pg;
