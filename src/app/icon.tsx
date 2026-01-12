import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default async function Icon() {
  // Fetch the SVG from Supabase
  const svgResponse = await fetch(
    'https://mmejhlyrwrqsvpmhasvg.supabase.co/storage/v1/object/public/branding/noun-owl-ok.svg'
  );
  const svgText = await svgResponse.text();

  // Modify the SVG to use light gray color (#d1d5db)
  // Replace any fill colors with our target color
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
          background: 'transparent',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={svgDataUri}
          alt=""
          width={32}
          height={32}
          style={{
            width: 32,
            height: 32,
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
