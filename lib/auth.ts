export function getAdminTokenFromRequest(req: Request) {
  return req.headers.get('x-admin-token') ?? ''
}

export function validateAdminToken(req: Request) {
  return getAdminTokenFromRequest(req) === process.env.ADMIN_PASSWORD
}

export const unauthorizedResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), {
  status: 401,
  headers: { 'Content-Type': 'application/json' },
})
