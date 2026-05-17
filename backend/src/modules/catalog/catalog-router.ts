import { Router } from 'express';
import { WorkshopRepository } from './workshop-repository.ts';
import { CatalogService } from './catalog-service.ts';
import { successResponse, errorResponse } from '../../shared/response-envelope.ts';
import { workshopQuerySchema } from '../../shared/workshop-schemas.ts';

const router = Router();
const repo = new WorkshopRepository();
const service = new CatalogService(repo);

router.get('/', async (req, res, next) => {
  try {
    const query = workshopQuerySchema.parse(req.query);
    const { data, total } = await service.getActiveWorkshops(query.limit, query.offset);
    
    res.json(successResponse(data, { total, limit: query.limit, offset: query.offset }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const workshop = await service.getWorkshopDetail(req.params.id);
    
    if (!workshop || (!workshop.is_published && req.user?.role !== 'organizer')) {
      return res.status(404).json(errorResponse('RESOURCE_NOT_FOUND', 'Không tìm thấy workshop'));
    }

    res.json(successResponse(workshop));
  } catch (err) {
    next(err);
  }
});

export default router;