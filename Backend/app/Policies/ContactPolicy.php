<?php

namespace App\Policies;

use App\Models\Contact;
use App\Models\User;

class ContactPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('contacts.view');
    }

    public function view(User $user, Contact $contact): bool
    {
        return $user->hasPermission('contacts.view');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('contacts.create');
    }

    public function update(User $user, Contact $contact): bool
    {
        if ($user->hasPermission('contacts.edit')) {
            return true;
        }

        // Agents may edit contacts they own even without the blanket permission.
        return $contact->owner_user_id === $user->id && $user->hasPermission('contacts.create');
    }

    public function delete(User $user, Contact $contact): bool
    {
        return $user->hasPermission('contacts.delete');
    }

    public function export(User $user): bool
    {
        return $user->hasPermission('contacts.export');
    }
}
