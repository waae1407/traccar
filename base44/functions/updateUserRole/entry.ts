import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Only admin can change user roles
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return Response.json({ error: 'Email and role are required' }, { status: 400 });
    }

    // Find user by email using service role
    const users = await base44.asServiceRole.entities.User.filter({ email });
    
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Update the user's role
    await base44.asServiceRole.entities.User.update(users[0].id, { role });

    return Response.json({ 
      success: true, 
      userId: users[0].id, 
      email: users[0].email,
      newRole: role 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});