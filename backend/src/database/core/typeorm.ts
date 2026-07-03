import {
  EntityManager,
  EntityTarget,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm'
import { DefaultEntity } from './base.entity'

export abstract class DefaultTypeOrmRepository<T extends DefaultEntity<T>> {
  private repository: Repository<T>
  protected transactionalEntityManager: EntityManager

  constructor(readonly entity: EntityTarget<T>, readonly manager: EntityManager) {
    /**
     * Note that we don't extend the Repository class from TypeORM, but we use it as a property.
     * This way we can control the access to the repository methods and avoid exposing them to the outside world.
     */
    this.repository = manager.getRepository(entity)
    this.transactionalEntityManager = manager
  }

  async save(entity: T): Promise<T> {
    return await this.repository.save(entity)
  }

  async update(criteria: number | string | FindOptionsWhere<T>, data: any) {
    return await this.repository.update(criteria, data)
  }

  async findOneById(externalId: string, relations?: string[]): Promise<T | null> {
    return this.repository.findOne({
      where: { externalId } as FindOptionsWhere<T>,
      relations,
    })
  }

  async findOneByPk(id: number): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    })
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(options)
  }

  async find(options: any): Promise<T[]> {
    return this.repository.find(options)
  }

  async exists(externalId: string): Promise<boolean> {
    return this.repository.exists({
      where: { externalId } as FindOptionsWhere<T>,
    })
  }

  async existsBy(properties: FindOptionsWhere<T>): Promise<boolean> {
    return this.repository.exists({
      where: properties,
    })
  }
}