<?php

namespace App\Repositories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Collection;

class ContactRepository
{
    public function __construct(
        private readonly Customer $model = new Customer,
    ) {}

    public function getByWorkspace(int $workspaceId): Collection
    {
        return $this->model->newQuery()
            ->where('workspace_id', $workspaceId)
            ->orderBy('name')
            ->get();
    }

    public function findById(int $id, int $workspaceId): ?Customer
    {
        return $this->model->newQuery()
            ->where('id', $id)
            ->where('workspace_id', $workspaceId)
            ->first();
    }

    public function create(array $data): Customer
    {
        return $this->model->newQuery()->create($data);
    }

    public function update(Customer $customer, array $data): Customer
    {
        $customer->fill($data)->save();

        return $customer;
    }

    public function delete(Customer $customer): bool
    {
        return $customer->forceDelete();
    }
}
