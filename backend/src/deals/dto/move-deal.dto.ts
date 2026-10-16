import { IsUUID } from 'class-validator';

// Backs the Kanban board's drag-and-drop — moving a deal card to a
// different column. Kept separate from UpdateDealDto so a stage move can be
// validated/audited independently of editing value/probability/notes (see
// DealsService.moveStage).
export class MoveDealDto {
  @IsUUID()
  stageId: string;
}
