import { WorkshopRepository } from './workshop-repository.ts';

export class CatalogService {
  constructor(private workshopRepo: WorkshopRepository) {}

  async getActiveWorkshops(limit: number, offset: number) {
    return await this.workshopRepo.findPublished(limit, offset);
  }

  async getWorkshopDetail(id: string) {
    return await this.workshopRepo.findById(id);
  }
}