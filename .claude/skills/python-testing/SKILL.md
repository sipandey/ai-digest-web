---
name: python-testing
description: "Python testing best practices: pytest patterns, fixtures, mocking, and TDD workflows"
---

# Python Testing Best Practices

## Test discovery and structure

- Store tests in `pipeline/tests/` or adjacent to source files as `test_*.py`
- Use pytest fixtures for setup/teardown (see `pipeline/tests/conftest.py`)
- Group related tests in test classes with a `Test` prefix

## Pytest essentials

```python
import pytest

@pytest.fixture
def example_resource():
    resource = setup()
    yield resource
    teardown(resource)

def test_with_fixture(example_resource):
    result = example_resource.do_work()
    assert result == expected
```

## Mocking and isolation

Use `unittest.mock` or `pytest-mock`:

```python
from unittest.mock import Mock, patch

def test_with_mock(mocker):
    mock_service = mocker.patch('module.Service')
    mock_service.return_value = Mock(status='ok')
    assert your_code_using_service()
```

## Running tests

```bash
python3 -m pytest pipeline/tests/ -v --tb=short
```

Aim for >80% coverage, prioritizing deterministic unit tests, input sanitization, and security boundaries.
