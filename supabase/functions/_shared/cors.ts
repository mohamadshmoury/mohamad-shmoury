export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ghawthani-admin',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(error: unknown, status = 400) {
  // Errors raised by npm modules inside the Deno isolate can come from a
  // different JavaScript realm, where `instanceof Error` is false even though
  // the value still exposes a normal message.
  const crossRealmMessage = error && typeof error === 'object' && 'message' in error
    ? (error as { message?: unknown }).message
    : undefined;
  const message = error instanceof Error
    ? error.message
    : typeof crossRealmMessage === 'string'
      ? crossRealmMessage
      : 'حدث خطأ غير متوقع.';
  return jsonResponse({ error: message }, status);
}
