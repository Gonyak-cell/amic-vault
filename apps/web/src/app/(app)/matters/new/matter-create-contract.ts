import {
  createMatterSchema,
  matterIntakeTemplateAccessScopes,
  type CreateMatterDto,
  type MatterAccessScope,
  type MatterIntakeTemplateCode,
  type MatterDto,
  type MatterType,
  type OrgDirectorySubjectDto,
} from '@amic-vault/shared';

export interface NewMatterFormState {
  accessScope: MatterAccessScope;
  clientId: string;
  intakeTemplateCode: MatterIntakeTemplateCode;
  matterCode: string;
  matterName: string;
  matterType: MatterType;
  practiceGroup: string;
}

type CreateMatter = (input: CreateMatterDto) => Promise<Pick<MatterDto, 'matterId'>>;
type RedirectToMatter = (href: string) => void;

export function buildCreateMatterInput(
  form: NewMatterFormState,
  selectedLead: OrgDirectorySubjectDto | null,
): CreateMatterDto {
  const practiceGroup = form.practiceGroup.trim();
  const accessScope = matterIntakeTemplateAccessScopes[form.intakeTemplateCode];
  return createMatterSchema.parse({
    clientId: form.clientId,
    accessScope,
    intakeTemplateCode: form.intakeTemplateCode,
    matterCode: form.matterCode.trim(),
    matterName: form.matterName.trim(),
    matterType: form.matterType,
    ...(practiceGroup ? { practiceGroup } : {}),
    ...(selectedLead?.subjectType === 'user' ? { leadLawyerId: selectedLead.subjectId } : {}),
  });
}

export async function submitCreateMatter(
  form: NewMatterFormState,
  selectedLead: OrgDirectorySubjectDto | null,
  createMatter: CreateMatter,
  redirectToMatter: RedirectToMatter,
): Promise<void> {
  const input = buildCreateMatterInput(form, selectedLead);
  const matter = await createMatter(input);
  redirectToMatter(`/matters/${matter.matterId}?created=1`);
}
