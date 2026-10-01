import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import EnvironmentService from '@/models/EnvironmentService';
import backupServices from '@/data/environments-backup.json';


// GET: Fetch all services (Auto-seeds if DB is empty)
export async function GET() {
  try {
    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Database connection failed. Please check MONGODB_URI.' },
        { status: 503 }
      );
    }

    let count = await EnvironmentService.countDocuments();
    if (count === 0) {
      console.log('EnvironmentService collection empty in MongoDB. Seeding initial records from backup JSON...');
      await EnvironmentService.insertMany(backupServices);
    }

    const services = await EnvironmentService.find().sort({ sortOrder: 1, createdAt: -1 });

    const formatted = services.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      category: s.category,
      description: s.description || '',
      devUrl: s.devUrl || '',
      qaUrl: s.qaUrl || '',
      prodUrl: s.prodUrl || '',
      localUrl: s.localUrl || '',
      tags: s.tags || [],
      sortOrder: s.sortOrder ?? 0,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({
      success: true,
      source: 'database',
      count: formatted.length,
      services: formatted,
    });
  } catch (error: any) {
    console.error('Error in GET /api/environments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch environments' },
      { status: 500 }
    );
  }
}

// POST: Create a new website/service in MongoDB
export async function POST(request: Request) {
  try {
    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Database connection unavailable' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { name, category, description, devUrl, qaUrl, prodUrl, localUrl, tags } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Service name is required' },
        { status: 400 }
      );
    }

    const newService = await EnvironmentService.create({
      name: name.trim(),
      category: category?.trim() || 'Web Apps',
      description: description?.trim() || '',
      devUrl: devUrl?.trim() || '',
      qaUrl: qaUrl?.trim() || '',
      prodUrl: prodUrl?.trim() || '',
      localUrl: localUrl?.trim() || '',
      tags: Array.isArray(tags) ? tags : [],
      sortOrder: 0,
    });

    return NextResponse.json({
      success: true,
      service: {
        id: newService._id.toString(),
        name: newService.name,
        category: newService.category,
        description: newService.description,
        devUrl: newService.devUrl,
        qaUrl: newService.qaUrl,
        prodUrl: newService.prodUrl,
        localUrl: newService.localUrl,
        tags: newService.tags,
        sortOrder: newService.sortOrder,
        updatedAt: newService.updatedAt,
        createdAt: newService.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/environments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create environment' },
      { status: 500 }
    );
  }
}

// PUT: Update an existing website/service in MongoDB
export async function PUT(request: Request) {
  try {
    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Database connection unavailable' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { id, name, category, description, devUrl, qaUrl, prodUrl, localUrl, tags } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Service id is required' }, { status: 400 });
    }

    const updated = await EnvironmentService.findByIdAndUpdate(
      id,
      {
        name: name?.trim(),
        category: category?.trim() || 'Web Apps',
        description: description?.trim() || '',
        devUrl: devUrl?.trim() || '',
        qaUrl: qaUrl?.trim() || '',
        prodUrl: prodUrl?.trim() || '',
        localUrl: localUrl?.trim() || '',
        tags: Array.isArray(tags) ? tags : [],
      },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Service not found in database' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      service: {
        id: updated._id.toString(),
        name: updated.name,
        category: updated.category,
        description: updated.description,
        devUrl: updated.devUrl,
        qaUrl: updated.qaUrl,
        prodUrl: updated.prodUrl,
        localUrl: updated.localUrl,
        tags: updated.tags,
        sortOrder: updated.sortOrder,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error in PUT /api/environments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update environment' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a service from MongoDB
export async function DELETE(request: Request) {
  try {
    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Database connection unavailable' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Service id query parameter is required' }, { status: 400 });
    }

    const deleted = await EnvironmentService.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Service not found in database' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Deleted service ${deleted.name} successfully`,
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/environments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete environment' },
      { status: 500 }
    );
  }
}
