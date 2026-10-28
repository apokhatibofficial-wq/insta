import Link from "next/link";
import { Brand } from "./Brand";
import { RobotImg } from "./robot/RobotImg";

// Shared layout of designs/Error Pages.dc.html.
export function StatusPage({
  robot,
  code,
  title,
  body,
  primary,
  secondary,
  reference,
}: {
  robot: "point" | "wink";
  code: string;
  title: string;
  body: string;
  primary: { label: string; href: string; external?: boolean };
  secondary?: React.ReactNode;
  reference?: string;
}) {
  return (
    <div className="status-page">
      <header className="login-header">
        <Brand />
      </header>
      <main className="status-main">
        <div className="status-box">
          <RobotImg name={`robot-${robot}`} className="status-robot" />
          <span className="status-code">{code}</span>
          <div className="status-text">
            <h1>{title}</h1>
            <p>{body}</p>
          </div>
          <div className="status-actions">
            {primary.external ? (
              <a className="btn btn-primary status-btn" href={primary.href} target="_blank" rel="noopener noreferrer">
                {primary.label}
              </a>
            ) : (
              <Link className="btn btn-primary status-btn" href={primary.href}>
                {primary.label}
              </Link>
            )}
            {secondary}
          </div>
          {reference && (
            <span className="status-ref">
              رقم المرجع للدعم: <span dir="ltr" className="mono">{reference}</span>
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
