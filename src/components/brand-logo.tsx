import clsx from "clsx";

export function BrandLogo({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      className={clsx("h-5 w-5", className)}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 11H40L50 21V49C50 52.3137 47.3137 55 44 55H16C12.6863 55 10 52.3137 10 49V17C10 13.6863 12.6863 11 16 11Z"
        fill="#F5E8D2"
        stroke="#3E2B1D"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M40 11V21H50"
        stroke="#3E2B1D"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M18 24H42" stroke="#CDB79A" strokeWidth="2.5" />
      <path d="M18 31H42" stroke="#CDB79A" strokeWidth="2.5" />
      <path d="M18 38H42" stroke="#CDB79A" strokeWidth="2.5" />
      <path d="M24 18V42" stroke="#CDB79A" strokeWidth="2.5" />
      <path d="M33 18V42" stroke="#CDB79A" strokeWidth="2.5" />
      <path d="M42 18V42" stroke="#CDB79A" strokeWidth="2.5" />

      <g transform="translate(10 29)">
        <circle cx="10" cy="16" r="9" fill="#D57D42" stroke="#2F2116" strokeWidth="3" />
        <circle cx="10" cy="16" r="3.6" fill="#F7F2E8" stroke="#2F2116" strokeWidth="2" />
        <circle cx="23" cy="8" r="9" fill="#8DAE63" stroke="#2F2116" strokeWidth="3" />
        <circle cx="23" cy="8" r="3.6" fill="#F7F2E8" stroke="#2F2116" strokeWidth="2" />
        <circle cx="35" cy="18" r="9" fill="#6E87C7" stroke="#2F2116" strokeWidth="3" />
        <circle cx="35" cy="18" r="3.6" fill="#F7F2E8" stroke="#2F2116" strokeWidth="2" />
      </g>
    </svg>
  );
}
