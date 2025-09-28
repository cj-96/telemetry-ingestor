import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: Date) {
          return value.getTime() <= new Date().getTime();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must not be a future date`;
        },
      },
    });
  };
}
