import { NextResponse, type NextRequest } from "next/server";
import { isFieldCopilotAuthEnabled } from "./app/lib/accessControl";

function unauthorized(message = "Authentication required.") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="Field Copilot", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  if (!isFieldCopilotAuthEnabled(process.env.FIELD_COPILOT_AUTH_ENABLED)) {
    return NextResponse.next();
  }

  const configuredUser = process.env.FIELD_COPILOT_USER;
  const configuredPass = process.env.FIELD_COPILOT_PASS;

  if (!configuredUser || !configuredPass) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      return new NextResponse("Field Copilot access is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized();
    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);
    if (user === configuredUser && pass === configuredPass) return NextResponse.next();
  } catch {
    return unauthorized("Invalid authentication header.");
  }

  return unauthorized();
}

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"],
};
