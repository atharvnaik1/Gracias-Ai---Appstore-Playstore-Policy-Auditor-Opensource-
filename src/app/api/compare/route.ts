import { NextRequest, NextResponse } from 'next/server';
import { compareFiles } from '@/lib/binary-compare';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { file1?: string; file2?: string };
    const { file1, file2 } = body;

    if (!file1 || typeof file1 !== 'string') {
      return NextResponse.json({ error: 'file1 path is required' }, { status: 400 });
    }
    if (!file2 || typeof file2 !== 'string') {
      return NextResponse.json({ error: 'file2 path is required' }, { status: 400 });
    }

    const result = await compareFiles(file1, file2);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Comparison failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file1 = searchParams.get('file1');
  const file2 = searchParams.get('file2');

  if (!file1 || !file2) {
    return NextResponse.json({ error: 'Query params file1 and file2 are required' }, { status: 400 });
  }

  try {
    const result = await compareFiles(file1, file2);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Comparison failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
