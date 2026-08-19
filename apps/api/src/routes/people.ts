import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

/** People list (merged data) with their skills — used by the demo and by n8n. */
export function registerPeopleRoutes(app: FastifyInstance) {
  app.get('/api/people', async () => {
    const people = await prisma.person.findMany({
      orderBy: { canonicalName: 'asc' },
      include: {
        sourceRecords: {
          select: { source: true, sourceRow: true, matchedBy: true },
          orderBy: { source: 'asc' },
        },
        skills: {
          select: { skill: { select: { name: true } } },
          orderBy: { skill: { name: 'asc' } },
        },
        classifications: true,
      },
    });
    return people.map((p) => ({
      id: p.id,
      name: p.canonicalName,
      email: p.email,
      phone: p.phone,
      city: p.city,
      experienceYears: p.experienceYears,
      currentCtc: p.currentCtc,
      ctcMalformed: p.ctcMalformed,
      sources: p.sourceRecords.map((s) => s.source),
      matchedBy: p.sourceRecords.map((s) => s.matchedBy),
      skills: p.skills.map((s) => s.skill.name),
      classifications: p.classifications,
    }));
  });
}