import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const admin = await base44.auth.me();

    if (admin?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email } = await req.json();
    if (!email) {
      return Response.json({ error: 'Missing email' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const users = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
    const user = users?.[0];

    if (!user) {
      return Response.json({ ok: true, deleted: false, message: 'No user found for this email' });
    }

    await base44.asServiceRole.entities.User.delete(user.id);

    return Response.json({ ok: true, deleted: true, email: normalizedEmail, user_id: user.id });
  } catch (error) {
    console.error('[DeleteUserAccountByEmail] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});