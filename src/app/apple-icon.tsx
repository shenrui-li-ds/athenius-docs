import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default async function AppleIcon() {
  // Fetch the SVG from Supabase
  const svgResponse = await fetch(
    'https://mmejhlyrwrqsvpmhasvg.supabase.co/storage/v1/object/public/branding/noun-owl-ok.svg'
  );
  const svgText = await svgResponse.text();

  // Modify the SVG to use light gray color (#d1d5db)
  const coloredSvg = svgText
    .replace(/fill="[^"]*"/g, 'fill="#d1d5db"')
    .replace(/fill:[^;"]*/g, 'fill:#d1d5db');

  // Convert to data URI
  const svgDataUri = `data:image/svg+xml,${encodeURIComponent(coloredSvg)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0f0f',
          borderRadius: 32,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={svgDataUri}
          alt=""
          width={140}
          height={140}
          style={{
            width: 140,
            height: 140,
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
