'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
  type CustomFieldDefinition,
  type CustomFieldDefinitionFormValues,
} from '@/lib/custom-fields-api';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
];

const ENTITY_TYPES = [
  { value: 'contact', label: 'Contact' },
  { value: 'deal', label: 'Deal' },
];

function FieldDefinitionForm({
  entityType,
  initial,
  onSave,
  onCancel,
}: {
  entityType: string;
  initial?: CustomFieldDefinition;
  onSave: (values: CustomFieldDefinitionFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [fieldType, setFieldType] = useState(initial?.field_type ?? 'text');
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false);
  const [options, setOptions] = useState<string>(
    initial?.options?.map((o) => o.label).join('\n') ?? ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values: CustomFieldDefinitionFormValues = {
      entity_type: entityType,
      name,
      field_type: fieldType,
      is_required: isRequired,
      is_active: true,
    };
    if (fieldType === 'select' && options.trim()) {
      values.options = options.split('\n').filter(Boolean).map((label) => ({
        label: label.trim(),
        value: label.trim().toLowerCase().replace(/\s+/g, '_'),
      }));
    }
    onSave(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Field Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="e.g. Industry"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Type</label>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldDefinition["field_type"])}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="rounded border-border"
        />
        Required field
      </label>

      {fieldType === 'select' && (
        <div className="space-y-1">
          <label className="text-sm font-medium">Options (one per line)</label>
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            rows={4}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          {initial ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default function CustomFieldsPage() {
  const [entityType, setEntityType] = useState('contact');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: definitions = [], isLoading } = useQuery({
    queryKey: ['custom-field-definitions', entityType],
    queryFn: () => fetchCustomFieldDefinitions(entityType),
  });

  const createMutation = useMutation({
    mutationFn: createCustomFieldDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-definitions'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CustomFieldDefinitionFormValues> }) =>
      updateCustomFieldDefinition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-definitions'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomFieldDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-definitions'] });
    },
  });

  const handleSave = (values: CustomFieldDefinitionFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const editingDef = editingId ? definitions.find((d) => d.id === editingId) : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Custom Fields</h1>
          <p className="text-sm text-muted">Define custom fields for contacts and deals</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Add Field
        </button>
      </div>

      <div className="flex gap-2">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et.value}
            onClick={() => setEntityType(et.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              entityType === et.value
                ? 'bg-primary text-white'
                : 'border hover:bg-muted'
            }`}
          >
            {et.label}
          </button>
        ))}
      </div>

      {showForm && (
        <FieldDefinitionForm
          entityType={entityType}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingDef && (
        <FieldDefinitionForm
          entityType={entityType}
          initial={editingDef}
          onSave={handleSave}
          onCancel={() => setEditingId(null)}
        />
      )}

      {isLoading ? (
        <div className="py-8 text-center text-muted">Loading...</div>
      ) : definitions.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted">
          No custom fields defined yet. Click "Add Field" to create one.
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted">
                <th className="p-3">Name</th>
                <th className="p-3">Key</th>
                <th className="p-3">Type</th>
                <th className="p-3">Required</th>
                <th className="p-3">Active</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((def) => (
                <tr key={def.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{def.name}</td>
                  <td className="p-3 font-mono text-sm text-muted">{def.key}</td>
                  <td className="p-3">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {FIELD_TYPES.find((t) => t.value === def.field_type)?.label ?? def.field_type}
                    </span>
                  </td>
                  <td className="p-3">{def.is_required ? 'Yes' : 'No'}</td>
                  <td className="p-3">{def.is_active ? 'Yes' : 'No'}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => { setEditingId(def.id); setShowForm(false); }}
                      className="mr-2 text-sm text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this custom field? Existing data will not be removed.')) {
                          deleteMutation.mutate(def.id);
                        }
                      }}
                      className="text-sm text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
